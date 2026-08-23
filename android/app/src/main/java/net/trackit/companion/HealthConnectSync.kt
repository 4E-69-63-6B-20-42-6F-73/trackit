package net.trackit.companion

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.permission.HealthPermission.Companion.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONObject
import kotlin.reflect.KClass

data class HistoricalImportProgress(
    val category: String,
    val categoryIndex: Int,
    val totalCategories: Int,
    val phase: HistoricalImportPhase,
    val discoveredRecords: Int = 0,
    val uploadedRecords: Int = 0,
    val issue: String? = null,
    val retryAfterSeconds: Int? = null,
    val retryAttempt: Int? = null,
)

enum class HistoricalImportPhase {
    PENDING,
    READING,
    UPLOADING,
    WAITING_TO_RETRY,
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

    val issues: Map<String, String>
        get() = categories.mapNotNull { (category, result) ->
            result.issue?.let { category to it }
        }.toMap()
}

object HistoricalProgressCodec {
    fun encode(states: Collection<HistoricalImportProgress>): String {
        val array = JSONArray()
        states.forEach { progress ->
            array.put(
                JSONObject()
                    .put("category", progress.category)
                    .put("index", progress.categoryIndex)
                    .put("total", progress.totalCategories)
                    .put("phase", progress.phase.name)
                    .put("discovered", progress.discoveredRecords)
                    .put("uploaded", progress.uploadedRecords)
                    .put("issue", progress.issue?.take(300))
                    .put("retryAfter", progress.retryAfterSeconds)
                    .put("retryAttempt", progress.retryAttempt),
            )
        }
        return array.toString()
    }

    fun decode(value: String?): List<HistoricalImportProgress> {
        if (value.isNullOrBlank()) return emptyList()

        return runCatching {
            val array = JSONArray(value)
            buildList {
                repeat(array.length()) { index ->
                    val item = array.getJSONObject(index)
                    add(
                        HistoricalImportProgress(
                            category = item.getString("category"),
                            categoryIndex = item.getInt("index"),
                            totalCategories = item.getInt("total"),
                            phase = HistoricalImportPhase.valueOf(item.getString("phase")),
                            discoveredRecords = item.optInt("discovered", 0),
                            uploadedRecords = item.optInt("uploaded", 0),
                            issue = item.optString("issue").takeIf { it.isNotBlank() && it != "null" },
                            retryAfterSeconds = item.optInt("retryAfter", -1).takeIf { it >= 0 },
                            retryAttempt = item.optInt("retryAttempt", -1).takeIf { it >= 0 },
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }
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
        onProgress: suspend (HistoricalImportProgress) -> Unit = {},
    ): HistoricalImportResult {
        val since =
            if (days == Int.MAX_VALUE) {
                Instant.EPOCH
            } else {
                Instant.now().minus(Duration.ofDays(days.toLong()))
            }

        val orderedTypes = supportedRecordTypes.filter { it in recordTypes }
        val outcomes = linkedMapOf<String, HistoricalImportCategoryResult>()

        orderedTypes.forEachIndexed { index, recordType ->
            if (cancelled()) throw CancellationException("Import cancelled")

            val category = recordType.simpleName.orEmpty()
            var discovered = 0
            var uploaded = 0

            onProgress(
                HistoricalImportProgress(
                    category = category,
                    categoryIndex = index,
                    totalCategories = orderedTypes.size,
                    phase = HistoricalImportPhase.READING,
                ),
            )

            try {
                var pageToken: String? = null

                do {
                    if (cancelled()) throw CancellationException("Import cancelled")

                    val response = readPage(
                        recordType = recordType,
                        filter = TimeRangeFilter.after(since),
                        pageToken = pageToken,
                    )

                    discovered += response.records.size

                    onProgress(
                        HistoricalImportProgress(
                            category = category,
                            categoryIndex = index,
                            totalCategories = orderedTypes.size,
                            phase = HistoricalImportPhase.READING,
                            discoveredRecords = discovered,
                            uploadedRecords = uploaded,
                        ),
                    )

                    val uploads = response.records.map { record ->
                        requireNotNull(HealthRecordAdapterRegistry.serialize(record)) {
                            "Unable to serialize ${record::class.simpleName}"
                        }
                    }

                    uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                        if (cancelled()) throw CancellationException("Import cancelled")

                        if (batch.isNotEmpty()) {
                            api.upload(
                                idempotencyKey = UUID.randomUUID().toString(),
                                records = batch,
                                onRetry = { retry ->
                                    onProgress(
                                        HistoricalImportProgress(
                                            category = category,
                                            categoryIndex = index,
                                            totalCategories = orderedTypes.size,
                                            phase = HistoricalImportPhase.WAITING_TO_RETRY,
                                            discoveredRecords = discovered,
                                            uploadedRecords = uploaded,
                                            issue = retry.reason,
                                            retryAfterSeconds = ((retry.retryAfterMillis + 999) / 1000).toInt(),
                                            retryAttempt = retry.attempt,
                                        ),
                                    )
                                },
                            )
                        }

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

                    pageToken = response.pageToken
                } while (pageToken != null)

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
                        discoveredRecords = discovered,
                        uploadedRecords = uploaded,
                    ),
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                val issue = "Health Connect access was revoked"
                outcomes[category] = HistoricalImportCategoryResult(discovered, uploaded, issue)
                onProgress(
                    HistoricalImportProgress(
                        category = category,
                        categoryIndex = index,
                        totalCategories = orderedTypes.size,
                        phase = HistoricalImportPhase.ERROR,
                        discoveredRecords = discovered,
                        uploadedRecords = uploaded,
                        issue = issue,
                    ),
                )
            } catch (e: Exception) {
                val issue = e.message ?: "Unknown error"
                outcomes[category] = HistoricalImportCategoryResult(discovered, uploaded, issue)
                onProgress(
                    HistoricalImportProgress(
                        category = category,
                        categoryIndex = index,
                        totalCategories = orderedTypes.size,
                        phase = HistoricalImportPhase.ERROR,
                        discoveredRecords = discovered,
                        uploadedRecords = uploaded,
                        issue = issue,
                    ),
                )
            }
        }

        return HistoricalImportResult(outcomes)
    }

    private suspend fun syncType(
        recordType: KClass<out Record>,
        cancelled: () -> Boolean,
    ) {
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
                        device = JSONObject(),
                        payload = JSONObject(),
                        lastModifiedTime = null,
                        deleted = true,
                    )
                    else -> null
                }
            }

            uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                if (cancelled()) throw CancellationException("Import cancelled")
                if (batch.isNotEmpty()) {
                    api.upload(UUID.randomUUID().toString(), batch)
                }
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
        val filter = TimeRangeFilter.after(Instant.now().minus(Duration.ofDays(30)))
        var pageToken: String? = null

        do {
            if (cancelled()) throw CancellationException("Import cancelled")

            val response = readPage(recordType, filter, pageToken)
            val uploads = response.records.map { record ->
                requireNotNull(HealthRecordAdapterRegistry.serialize(record)) {
                    "Unable to serialize ${record::class.simpleName}"
                }
            }

            uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                if (cancelled()) throw CancellationException("Import cancelled")
                if (batch.isNotEmpty()) {
                    api.upload(UUID.randomUUID().toString(), batch)
                }
            }

            pageToken = response.pageToken
        } while (pageToken != null)
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun readPage(
        recordType: KClass<out Record>,
        filter: TimeRangeFilter,
        pageToken: String?,
    ) = health.readRecords(
        ReadRecordsRequest(
            recordType = recordType as KClass<Record>,
            timeRangeFilter = filter,
            pageSize = READ_PAGE_SIZE,
            pageToken = pageToken,
        ),
    )
}
