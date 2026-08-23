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

    val supportedRecordTypes: List<KClass<out Record>> =
        HealthRecordAdapterRegistry.supportedRecordTypes

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
                val uploads = records.mapNotNull(HealthRecordAdapterRegistry::serialize)
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
                    is UpsertionChange -> HealthRecordAdapterRegistry.serialize(change.record)
                    is DeletionChange -> TrackItHealthRecord(
                        recordType = key,
                        externalId = change.recordId,
                        externalVersion = 9_007_199_254_740_991L,
                        startTime = Instant.EPOCH.toString(),
                        endTime = null,
                        dataOrigin = null,
                        recordingMethod = null,
                        device = org.json.JSONObject(),
                        payload = org.json.JSONObject(),
                        lastModifiedTime = null,
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
        val records = readWindowDynamic(recordType, filter, cancelled)

        records.mapNotNull(HealthRecordAdapterRegistry::serialize).chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
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

    @Suppress("UNCHECKED_CAST")
    private suspend fun readWindowDynamic(
        recordType: KClass<out Record>,
        filter: TimeRangeFilter,
        cancelled: () -> Boolean,
    ): List<Record> = readWindow(recordType as KClass<Record>, filter, cancelled)

}
