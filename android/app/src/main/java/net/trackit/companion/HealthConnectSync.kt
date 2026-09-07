package net.trackit.companion

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.permission.HealthPermission.Companion.PERMISSION_READ_HEALTH_DATA_HISTORY
import androidx.health.connect.client.permission.HealthPermission.Companion.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withTimeout
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

private class HealthConnectReadTimeoutException(
    recordType: String,
) : Exception("Health Connect did not respond within 60 seconds for $recordType")

private class SyncPhaseTimings {
    val startedAt = System.nanoTime()
    var healthReadNanos = 0L
    var serializeNanos = 0L
    var uploadNanos = 0L
    var reconcileNanos = 0L
    var cursorNanos = 0L

    fun log(category: String, records: Int) {
        Log.i(
            "TrackItSyncPerf",
            "category=$category records=$records healthReadMs=${ms(healthReadNanos)} " +
                "serializeMs=${ms(serializeNanos)} uploadMs=${ms(uploadNanos)} " +
                "reconcileMs=${ms(reconcileNanos)} cursorMs=${ms(cursorNanos)} " +
                "totalMs=${ms(System.nanoTime() - startedAt)}",
        )
    }

    private fun ms(value: Long): Long = value / 1_000_000L
}

class HealthConnectSync(private val context: Context) {
    companion object {
        private const val UPLOAD_BATCH_SIZE = UploadBatchPlanner.MAX_UPLOAD_RECORDS
        private const val READ_PAGE_SIZE = 1000
        private const val READ_TIMEOUT_MS = 60_000L
        private const val LOG_TAG = "TrackItHistorical"
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
        includeHistory: Boolean = false,
    ): Set<String> {
        val permissions = permissionsFor(recordTypes).toMutableSet()
        if (includeBackground && supportsBackgroundRead()) {
            permissions += PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
        }
        if (includeHistory && supportsHistoryRead()) {
            permissions += PERMISSION_READ_HEALTH_DATA_HISTORY
        }
        return permissions
    }

    fun availability() = HealthConnectClient.getSdkStatus(context)

    fun supportsBackgroundRead(): Boolean =
        health.features.getFeatureStatus(
            HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND,
        ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    fun supportsHistoryRead(): Boolean =
        health.features.getFeatureStatus(
            HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY,
        ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    suspend fun grantedPermissions(): Set<String> =
        health.permissionController.getGrantedPermissions()

    suspend fun hasPermissions(required: Set<String>): Boolean =
        grantedPermissions().containsAll(required)

    suspend fun hasBackgroundReadPermission(): Boolean =
        PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND in grantedPermissions()

    suspend fun hasHistoryReadPermission(): Boolean =
        PERMISSION_READ_HEALTH_DATA_HISTORY in grantedPermissions()

    suspend fun syncSelected(
        recordTypes: Set<KClass<out Record>>,
        cancelled: () -> Boolean = { false },
        onProgress: (SyncProgressUpdate) -> Unit = {},
    ): Map<String, CategorySyncOutcome> {
        return CategorySyncRunner.run(
            categories = recordTypes,
            cancelled = cancelled,
            sync = { type -> syncType(type, cancelled, onProgress) },
            onResult = { type, outcome, _, _ ->
                val key = type.simpleName.orEmpty()
                if (outcome.result != CategorySyncResult.COMPLETE) {
                    runCatching {
                        api.updateCursor(
                            key,
                            state.cursor(key),
                            when (outcome.result) {
                                CategorySyncResult.COMPLETE -> "complete"
                                CategorySyncResult.PERMISSION_REVOKED -> "permission_revoked"
                                CategorySyncResult.ERROR -> "error"
                            },
                        )
                    }
                    onProgress(
                        SyncProgressUpdate(
                            recordType = key,
                            status = if (outcome.result == CategorySyncResult.PERMISSION_REVOKED) {
                                CategorySyncStatus.PERMISSION_REQUIRED
                            } else {
                                CategorySyncStatus.ERROR
                            },
                            message = outcome.message,
                        ),
                    )
                }
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
            val timings = SyncPhaseTimings()
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
                coroutineScope {
                    var requestedPageToken: String? = null
                    var pending = async {
                        timedHealthRead(timings) {
                            readPage(
                                recordType = recordType,
                                filter = TimeRangeFilter.after(since),
                                pageToken = requestedPageToken,
                            )
                        }
                    }

                    while (true) {
                        if (cancelled()) throw CancellationException("Import cancelled")
                        val response = pending.await()
                        val nextPageToken = response.pageToken
                        if (nextPageToken != null && nextPageToken == requestedPageToken) {
                            throw IllegalStateException(
                                "Health Connect repeated the page token for $category",
                            )
                        }
                        val nextPending = nextPageToken?.let { token ->
                            async {
                                timedHealthRead(timings) {
                                    readPage(
                                        recordType = recordType,
                                        filter = TimeRangeFilter.after(since),
                                        pageToken = token,
                                    )
                                }
                            }
                        }

                        Log.i(
                            LOG_TAG,
                            "$category returned ${response.records.size} records, next=$nextPageToken",
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

                        val serializeStartedAt = System.nanoTime()
                        val uploads = response.records.map { record ->
                            requireNotNull(HealthRecordAdapterRegistry.serialize(record)) {
                                "Unable to serialize ${record::class.simpleName}"
                            }
                        }
                        timings.serializeNanos += System.nanoTime() - serializeStartedAt

                        uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                            if (cancelled()) throw CancellationException("Import cancelled")
                            if (batch.isNotEmpty()) {
                                val uploadStartedAt = System.nanoTime()
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
                                timings.uploadNanos += System.nanoTime() - uploadStartedAt
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

                        if (nextPending == null) break
                        requestedPageToken = nextPageToken
                        pending = nextPending
                    }
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
                        discoveredRecords = discovered,
                        uploadedRecords = uploaded,
                    ),
                )
                timings.log("historical:$category", uploaded)
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
                timings.log("historical:$category", uploaded)
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
                timings.log("historical:$category", uploaded)
            }
        }

        return HistoricalImportResult(outcomes)
    }

    private suspend fun syncType(
        recordType: KClass<out Record>,
        cancelled: () -> Boolean,
        onProgress: (SyncProgressUpdate) -> Unit,
    ) {
        val key = recordType.simpleName.orEmpty()
        val timings = SyncPhaseTimings()
        var discovered = 0
        var uploaded = 0
        val savedToken = state.cursor(key)
        var token: String

        onProgress(SyncProgressUpdate(key, CategorySyncStatus.WAITING))

        if (savedToken == null) {
            token = timedHealthRead(timings) { newChangesToken(recordType) }
            val counts = rereadWindow(
                recordType,
                cancelled,
                onProgress,
                discovered,
                uploaded,
                timings,
            )
            discovered = counts.first
            uploaded = counts.second
        } else {
            token = savedToken
        }

        coroutineScope {
            var pending = async { timedHealthRead(timings) { health.getChanges(token) } }

            while (true) {
                if (cancelled()) throw CancellationException("Sync cancelled")
                val response = pending.await()

                if (response.changesTokenExpired) {
                    token = timedHealthRead(timings) { newChangesToken(recordType) }
                    val counts = rereadWindow(
                        recordType,
                        cancelled,
                        onProgress,
                        discovered,
                        uploaded,
                        timings,
                    )
                    discovered = counts.first
                    uploaded = counts.second
                    pending = async { timedHealthRead(timings) { health.getChanges(token) } }
                    continue
                }

                val nextToken = response.nextChangesToken
                val nextPending = if (response.hasMore) {
                    async { timedHealthRead(timings) { health.getChanges(nextToken) } }
                } else {
                    null
                }

                val serializeStartedAt = System.nanoTime()
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
                timings.serializeNanos += System.nanoTime() - serializeStartedAt

                discovered += uploads.size
                onProgress(
                    SyncProgressUpdate(
                        recordType = key,
                        status = CategorySyncStatus.READING,
                        discoveredRecords = discovered,
                        uploadedRecords = uploaded,
                        remainingRecords = uploads.size,
                        hasMore = response.hasMore,
                    ),
                )

                uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                    if (cancelled()) throw CancellationException("Sync cancelled")
                    if (batch.isNotEmpty()) {
                        val uploadStartedAt = System.nanoTime()
                        api.upload(
                            UUID.randomUUID().toString(),
                            batch,
                            onRetry = { retry ->
                                onProgress(
                                    SyncProgressUpdate(
                                        recordType = key,
                                        status = CategorySyncStatus.RETRYING,
                                        discoveredRecords = discovered,
                                        uploadedRecords = uploaded,
                                        remainingRecords = (discovered - uploaded).coerceAtLeast(0),
                                        hasMore = response.hasMore,
                                        message = "${retry.reason}; retry ${retry.attempt + 1}/${retry.maxAttempts}",
                                    ),
                                )
                            },
                        )
                        timings.uploadNanos += System.nanoTime() - uploadStartedAt
                        uploaded += batch.size
                        onProgress(
                            SyncProgressUpdate(
                                recordType = key,
                                status = CategorySyncStatus.UPLOADING,
                                discoveredRecords = discovered,
                                uploadedRecords = uploaded,
                                remainingRecords = (discovered - uploaded).coerceAtLeast(0),
                                hasMore = response.hasMore,
                            ),
                        )
                    }
                }

                token = nextToken
                if (nextPending == null) break
                pending = nextPending
            }
        }

        state.saveCursor(key, token)
        val cursorStartedAt = System.nanoTime()
        api.updateCursor(key, token, "complete")
        timings.cursorNanos += System.nanoTime() - cursorStartedAt
        onProgress(
            SyncProgressUpdate(
                recordType = key,
                status = CategorySyncStatus.COMPLETE,
                discoveredRecords = discovered,
                uploadedRecords = uploaded,
            ),
        )
        timings.log(key, uploaded)
    }

    private suspend fun newChangesToken(recordType: KClass<out Record>): String =
        health.getChangesToken(ChangesTokenRequest(setOf(recordType)))

    private suspend fun rereadWindow(
        recordType: KClass<out Record>,
        cancelled: () -> Boolean,
        onProgress: (SyncProgressUpdate) -> Unit,
        initialDiscovered: Int,
        initialUploaded: Int,
        timings: SyncPhaseTimings,
    ): Pair<Int, Int> {
        val since = Instant.now().minus(Duration.ofDays(30))
        val filter = TimeRangeFilter.after(since)
        val presentExternalIds = mutableSetOf<String>()
        var discovered = initialDiscovered
        var uploaded = initialUploaded
        val category = recordType.simpleName.orEmpty()

        coroutineScope {
            var requestedPageToken: String? = null
            var pending = async {
                timedHealthRead(timings) {
                    readPage(
                        recordType = recordType,
                        filter = filter,
                        pageToken = requestedPageToken,
                    )
                }
            }

            while (true) {
                if (cancelled()) throw CancellationException("Sync cancelled")
                onProgress(
                    SyncProgressUpdate(
                        recordType = category,
                        status = CategorySyncStatus.READING,
                        discoveredRecords = discovered,
                        uploadedRecords = uploaded,
                        remainingRecords = (discovered - uploaded).coerceAtLeast(0),
                        hasMore = true,
                        message = if (requestedPageToken == null) "Checking the recent 30-day window" else null,
                    ),
                )

                val response = pending.await()
                val nextPageToken = response.pageToken
                if (nextPageToken != null && nextPageToken == requestedPageToken) {
                    throw IllegalStateException(
                        "Health Connect repeated the page token for $category",
                    )
                }
                val nextPending = nextPageToken?.let { token ->
                    async {
                        timedHealthRead(timings) {
                            readPage(
                                recordType = recordType,
                                filter = filter,
                                pageToken = token,
                            )
                        }
                    }
                }

                Log.i(
                    LOG_TAG,
                    "$category reread returned ${response.records.size} records, next=$nextPageToken",
                )

                val serializeStartedAt = System.nanoTime()
                val uploads = response.records.map { record ->
                    presentExternalIds += record.metadata.id
                    requireNotNull(HealthRecordAdapterRegistry.serialize(record)) {
                        "Unable to serialize ${record::class.simpleName}"
                    }
                }
                timings.serializeNanos += System.nanoTime() - serializeStartedAt
                discovered += uploads.size

                onProgress(
                    SyncProgressUpdate(
                        recordType = category,
                        status = CategorySyncStatus.READING,
                        discoveredRecords = discovered,
                        uploadedRecords = uploaded,
                        remainingRecords = (discovered - uploaded).coerceAtLeast(0),
                        hasMore = nextPageToken != null,
                    ),
                )

                uploads.chunked(UPLOAD_BATCH_SIZE).forEach { batch ->
                    if (cancelled()) throw CancellationException("Sync cancelled")
                    if (batch.isNotEmpty()) {
                        val uploadStartedAt = System.nanoTime()
                        api.upload(
                            UUID.randomUUID().toString(),
                            batch,
                            onRetry = { retry ->
                                onProgress(
                                    SyncProgressUpdate(
                                        recordType = category,
                                        status = CategorySyncStatus.RETRYING,
                                        discoveredRecords = discovered,
                                        uploadedRecords = uploaded,
                                        remainingRecords = (discovered - uploaded).coerceAtLeast(0),
                                        hasMore = nextPageToken != null,
                                        message = "${retry.reason}; retry ${retry.attempt + 1}/${retry.maxAttempts}",
                                    ),
                                )
                            },
                        )
                        timings.uploadNanos += System.nanoTime() - uploadStartedAt
                        uploaded += batch.size
                        onProgress(
                            SyncProgressUpdate(
                                recordType = category,
                                status = CategorySyncStatus.UPLOADING,
                                discoveredRecords = discovered,
                                uploadedRecords = uploaded,
                                remainingRecords = (discovered - uploaded).coerceAtLeast(0),
                                hasMore = nextPageToken != null,
                            ),
                        )
                    }
                }

                if (nextPending == null) break
                requestedPageToken = nextPageToken
                pending = nextPending
            }
        }

        val reconcileStartedAt = System.nanoTime()
        api.reconcile(category, since, presentExternalIds)
        timings.reconcileNanos += System.nanoTime() - reconcileStartedAt
        return discovered to uploaded
    }

    private suspend fun <T> timedHealthRead(
        timings: SyncPhaseTimings,
        block: suspend () -> T,
    ): T {
        val startedAt = System.nanoTime()
        return try {
            block()
        } finally {
            timings.healthReadNanos += System.nanoTime() - startedAt
        }
    }

    @Suppress("UNCHECKED_CAST")
    private suspend fun readPage(
        recordType: KClass<out Record>,
        filter: TimeRangeFilter,
        pageToken: String?,
    ) = try {
        withTimeout(READ_TIMEOUT_MS) {
            health.readRecords(
                ReadRecordsRequest(
                    recordType = recordType as KClass<Record>,
                    timeRangeFilter = filter,
                    pageSize = READ_PAGE_SIZE,
                    pageToken = pageToken,
                ),
            )
        }
    } catch (_: TimeoutCancellationException) {
        throw HealthConnectReadTimeoutException(
            recordType.simpleName.orEmpty(),
        )
    }
}
