package net.trackit.companion

import android.content.Context
import android.util.Log
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


data class HistoricalImportProgress(
    val category: String,
    val categoryIndex: Int,
    val totalCategories: Int,
    val phase: HistoricalImportPhase,
    val discoveredRecords: Int = 0,
    val uploadedRecords: Int = 0,
    val issue: String? = null,
)

enum class HistoricalImportPhase {
    READING,
    UPLOADING,
    COMPLETE,
    ERROR,
}

data class HistoricalImportCategoryResult(
    val discoveredRecords: Int = 0,
    val uploadedRecords: Int = 0,
    val issue: String? = null,
)

data class HistoricalImportResult(
    val categories: Map<String, HistoricalImportCategoryResult>,
) {
    val uploadedRecords: Int get() = categories.values.sumOf { it.uploadedRecords }
    val issues: Map<String, String> get() = categories.mapNotNull { (category, result) ->
        result.issue?.let { category to it }
    }.toMap()
}

class HealthConnectSync(private val context: Context) {
    companion object {
        private const val UPLOAD_BATCH_SIZE = 1000
        private const val READ_PAGE_SIZE = 1000
    }

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

    suspend fun importHistorical(
        recordTypes: Set<KClass<out Record>>,
        days: Int,
        cancelled: () -> Boolean = { false },
        onProgress: (HistoricalImportProgress) -> Unit = {},
    ): HistoricalImportResult {
        val since = if (days == Int.MAX_VALUE) Instant.EPOCH else Instant.now().minus(Duration.ofDays(days.toLong()))
        val orderedTypes = supportedRecordTypes.filter { it in recordTypes }
        val outcomes = linkedMapOf<String, HistoricalImportCategoryResult>()

        orderedTypes.forEachIndexed { index, recordType ->
            if (cancelled()) throw CancellationException("Import cancelled")
            val category = recordType.simpleName.orEmpty()
            onProgress(HistoricalImportProgress(category, index, orderedTypes.size, HistoricalImportPhase.READING))

            var discovered = 0
            var uploaded = 0
            try {
                val records = readWindow(recordType, TimeRangeFilter.after(since), cancelled)
                discovered = records.size
                val uploads = records.mapNotNull(::mapRecord)
                onProgress(
                    HistoricalImportProgress(
                        category = category,
                        categoryIndex = index,
                        totalCategories = orderedTypes.size,
                        phase = HistoricalImportPhase.UPLOADING,
                        discoveredRecords = records.size,
                        uploadedRecords = 0,
                    ),
                )

                uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                    if (cancelled()) throw CancellationException("Import cancelled")
                    if (batch.isNotEmpty()) api.upload(UUID.randomUUID().toString(), batch)
                    uploaded += batch.size
                    onProgress(
                        HistoricalImportProgress(
                            category = category,
                            categoryIndex = index,
                            totalCategories = orderedTypes.size,
                            phase = HistoricalImportPhase.UPLOADING,
                            discoveredRecords = discovered,
                            uploadedRecords = uploaded,
                        ),
                    )
                }

                outcomes[category] = HistoricalImportCategoryResult(
                    discoveredRecords = discovered,
                    uploadedRecords = uploaded,
                )
                onProgress(
                    HistoricalImportProgress(
                        category = category,
                        categoryIndex = index,
                        totalCategories = orderedTypes.size,
                        phase = HistoricalImportPhase.COMPLETE,
                        discoveredRecords = records.size,
                        uploadedRecords = uploaded,
                    ),
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                val issue = "Health Connect access was revoked"
                outcomes[category] = HistoricalImportCategoryResult(discovered, uploaded, issue)
                onProgress(HistoricalImportProgress(category, index, orderedTypes.size, HistoricalImportPhase.ERROR, discovered, uploaded, issue))
            } catch (e: Exception) {
                val issue = e.message ?: "Unknown error"
                outcomes[category] = HistoricalImportCategoryResult(discovered, uploaded, issue)
                onProgress(HistoricalImportProgress(category, index, orderedTypes.size, HistoricalImportPhase.ERROR, discovered, uploaded, issue))
            }
        }

        return HistoricalImportResult(outcomes)
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

            uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                if (cancelled()) throw CancellationException("Import cancelled")
                api.upload(UUID.randomUUID().toString(), batch)
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

        records.mapNotNull(::mapRecord).chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
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
                    pageSize = READ_PAGE_SIZE,
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
