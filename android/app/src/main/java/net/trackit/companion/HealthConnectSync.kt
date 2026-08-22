package net.trackit.companion

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.permission.HealthPermission.Companion.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlin.reflect.KClass

class HealthConnectSync(private val context: Context) {
    private val health by lazy { HealthConnectClient.getOrCreate(context) }
    private val api = TrackItApi(context)
    private val state = CredentialStore(context)

    val supportedRecordTypes: List<KClass<out Record>> = listOf(
        StepsRecord::class,
        SleepSessionRecord::class,
        WeightRecord::class,
        HeartRateRecord::class,
        RestingHeartRateRecord::class,
        ExerciseSessionRecord::class,
    )

    fun permissionsFor(recordTypes: Set<KClass<out Record>>): Set<String> =
        recordTypes.map(HealthPermission::getReadPermission).toSet()

    fun permissionsFor(
        recordTypes: Set<KClass<out Record>>,
        includeBackground: Boolean,
    ): Set<String> {
        val permissions = permissionsFor(recordTypes).toMutableSet()
        if (includeBackground && supportsBackgroundRead()) {
            permissions += PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
        }
        return permissions
    }

    fun availability() = HealthConnectClient.getSdkStatus(context)

    fun supportsBackgroundRead(): Boolean =
        health.features.getFeatureStatus(
            HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND,
        ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    suspend fun grantedPermissions(): Set<String> =
        health.permissionController.getGrantedPermissions()

    suspend fun hasPermissions(required: Set<String>): Boolean =
        grantedPermissions().containsAll(required)

    suspend fun hasBackgroundReadPermission(): Boolean =
        PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in grantedPermissions()

    suspend fun syncSelected(
        recordTypes: Set<KClass<out Record>>,
        cancelled: () -> Boolean = { false },
        onProgress: (completed: Int, total: Int, recordType: String) -> Unit = { _, _, _ -> },
    ): Map<String, String> {
        return CategorySyncRunner.run(
            categories = recordTypes,
            cancelled = cancelled,
            sync = { type -> syncType(type, cancelled) },
            onResult = { type, result, completed, total ->
                val key = type.simpleName.orEmpty()
                if (result != "complete") {
                    try {
                        api.updateCursor(key, state.cursor(key), result)
                    } catch (_: Exception) {
                    }
                }
                onProgress(completed, total, key)
            },
        ).mapKeys { it.key.simpleName.orEmpty() }
    }

    private suspend fun syncType(recordType: KClass<out Record>, cancelled: () -> Boolean) {
        val key = recordType.simpleName.orEmpty()
        val savedToken = state.cursor(key)
        var token: String

        if (savedToken == null) {
            token = newChangesToken(recordType)
            rereadWindow(recordType, cancelled)
        } else {
            token = savedToken
        }

        api.updateCursor(key, token, "syncing")

        while (true) {
            if (cancelled()) throw CancellationException("Import cancelled")

            val response = health.getChanges(token)
            if (response.changesTokenExpired) {
                token = newChangesToken(recordType)
                rereadWindow(recordType, cancelled)
                api.updateCursor(key, token, "syncing")
                continue
            }

            val uploads = response.changes.mapNotNull { change ->
                when (change) {
                    is UpsertionChange -> mapRecord(change.record)
                    is DeletionChange -> HealthUpload(
                        externalId = change.recordId,
                        metric = key,
                        value = 0.0,
                        unit = "deleted",
                        observedAt = Instant.EPOCH.toString(),
                        endedAt = null,
                        version = 9_007_199_254_740_991L,
                        dataOrigin = "Health Connect",
                        deleted = true,
                    )
                    else -> null
                }
            }

            if (uploads.isNotEmpty()) {
                api.upload(UUID.randomUUID().toString(), uploads)
            }

            token = response.nextChangesToken
            if (!response.hasMore) break
        }

        state.saveCursor(key, token)
        api.updateCursor(key, token, "complete")
    }

    private suspend fun newChangesToken(recordType: KClass<out Record>): String =
        health.getChangesToken(ChangesTokenRequest(setOf(recordType)))

    private suspend fun rereadWindow(
        recordType: KClass<out Record>,
        cancelled: () -> Boolean,
    ) {
        val since = Instant.now().minus(Duration.ofDays(30))
        val filter = TimeRangeFilter.after(since)
        val records: List<Record> = when (recordType) {
            StepsRecord::class -> readWindow(StepsRecord::class, filter, cancelled)
            SleepSessionRecord::class -> readWindow(SleepSessionRecord::class, filter, cancelled)
            WeightRecord::class -> readWindow(WeightRecord::class, filter, cancelled)
            HeartRateRecord::class -> readWindow(HeartRateRecord::class, filter, cancelled)
            RestingHeartRateRecord::class -> readWindow(RestingHeartRateRecord::class, filter, cancelled)
            ExerciseSessionRecord::class -> readWindow(ExerciseSessionRecord::class, filter, cancelled)
            else -> emptyList()
        }

        records.mapNotNull(::mapRecord).chunked(500).forEach { batch ->
            if (cancelled()) throw CancellationException("Import cancelled")
            if (batch.isNotEmpty()) {
                api.upload(UUID.randomUUID().toString(), batch)
            }
        }
    }

    private suspend fun <T : Record> readWindow(
        recordType: KClass<T>,
        filter: TimeRangeFilter,
        cancelled: () -> Boolean,
    ): List<Record> {
        val records = mutableListOf<Record>()
        var pageToken: String? = null

        do {
            if (cancelled()) throw CancellationException("Import cancelled")
            val response = health.readRecords(
                ReadRecordsRequest(
                    recordType = recordType,
                    timeRangeFilter = filter,
                    pageSize = 1000,
                    pageToken = pageToken,
                ),
            )
            records.addAll(response.records)
            pageToken = response.pageToken
        } while (pageToken != null)

        return records
    }

    private fun mapRecord(record: Record): HealthUpload? {
        val metadata = record.metadata
        val common = Triple(
            metadata.id,
            metadata.lastModifiedTime.toEpochMilli(),
            metadata.dataOrigin.packageName,
        )

        return when (record) {
            is StepsRecord -> HealthUpload(common.first, "steps", record.count.toDouble(), "count", HealthTime.serialize(record.startTime), HealthTime.serialize(record.endTime), common.second, common.third)
            is SleepSessionRecord -> HealthUpload(common.first, "sleep", HealthTime.hoursBetween(record.startTime, record.endTime), "hours", HealthTime.serialize(record.startTime), HealthTime.serialize(record.endTime), common.second, common.third)
            is WeightRecord -> HealthUpload(common.first, "weight", record.weight.inKilograms, "kg", HealthTime.serialize(record.time), null, common.second, common.third)
            is HeartRateRecord -> HealthUpload(common.first, "heart_rate", record.samples.map { it.beatsPerMinute }.average(), "bpm", HealthTime.serialize(record.startTime), HealthTime.serialize(record.endTime), common.second, common.third)
            is RestingHeartRateRecord -> HealthUpload(common.first, "resting_heart_rate", record.beatsPerMinute.toDouble(), "bpm", HealthTime.serialize(record.time), null, common.second, common.third)
            is ExerciseSessionRecord -> HealthUpload(common.first, "exercise", Duration.between(record.startTime, record.endTime).toMinutes().toDouble(), "minutes", HealthTime.serialize(record.startTime), HealthTime.serialize(record.endTime), common.second, common.third)
            else -> null
        }
    }
}
