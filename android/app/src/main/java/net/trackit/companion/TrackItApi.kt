package net.trackit.companion

import android.content.Context
import android.util.Log
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.UnknownHostException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.Signature
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class TrackItHealthRecord(
    val provider: String = "health_connect",
    val recordType: String,
    val externalId: String,
    val externalVersion: Long,
    val startTime: String,
    val endTime: String?,
    val dataOrigin: String?,
    val recordingMethod: String?,
    val device: JSONObject,
    val payload: JSONObject,
    val lastModifiedTime: String?,
    val deleted: Boolean = false,
)

data class ApiRetryEvent(
    val reason: String,
    val retryAfterMillis: Long,
    val attempt: Int,
    val maxAttempts: Int,
)

private class HttpResponseException(
    val statusCode: Int,
    val responseBody: String,
    val retryAfterMillis: Long? = null,
) : IOException(
    buildString {
        append("HTTP ")
        append(statusCode)
        if (responseBody.isNotBlank()) {
            append(": ")
            append(responseBody.take(500))
        }
    },
)

class TrackItApi(context: Context) {
    companion object {
        private const val MAX_ATTEMPTS = 6
        private const val PERF_LOG_TAG = "TrackItSyncPerf"
        private const val HEX = "0123456789abcdef"
    }

    private val credentials = CredentialStore(context)
    private val syncLog = SyncLogStore(context)
    private val secureRandom = SecureRandom()
    private val uploadLimitPreferences = context.getSharedPreferences(
        "trackit-upload-batch-limits",
        Context.MODE_PRIVATE,
    )
    private val uploadBatchLimits = AdaptiveUploadBatchLimits(
        readLimit = { recordType ->
            uploadLimitPreferences.getInt(recordType, -1).takeIf { it > 0 }
        },
        writeLimit = { recordType, limit ->
            uploadLimitPreferences.edit().putInt(recordType, limit).apply()
        },
    )
    private val reconcileLimitPreferences = context.getSharedPreferences(
        "trackit-reconcile-batch-limits",
        Context.MODE_PRIVATE,
    )
    private val reconcileBatchLimits = AdaptiveUploadBatchLimits(
        readLimit = { recordType ->
            reconcileLimitPreferences.getInt(recordType, -1).takeIf { it > 0 }
        },
        writeLimit = { recordType, limit ->
            reconcileLimitPreferences.edit().putInt(recordType, limit).apply()
        },
    )
    private val keyStore by lazy {
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    }

    suspend fun upload(
        idempotencyKey: String,
        records: List<TrackItHealthRecord>,
        onRetry: suspend (ApiRetryEvent) -> Unit = {},
    ) {
        if (records.isEmpty()) return
        val recordType = records.first().recordType
        require(records.all { it.recordType == recordType }) {
            "Upload records must share a recordType"
        }
        val maxRecords = uploadBatchLimits.limitFor(recordType)
        val batches = UploadBatchPlanner.plan(
            idempotencyKey = idempotencyKey,
            records = records,
            maxRecords = maxRecords,
        )
        if (batches.size > 1) {
            syncLog.record(
                SyncLogLevel.INFO,
                SyncEventType.CATEGORY,
                "Uploading ${records.size} $recordType records as ${batches.size} requests with a $maxRecords-record limit",
            )
        }
        batches.forEach { batch ->
            uploadAdaptive(
                recordType = recordType,
                idempotencyKey = batch.idempotencyKey,
                records = batch.records,
                onRetry = onRetry,
            )
        }
    }

    suspend fun updateCursor(
        recordType: String,
        cursor: String?,
        status: String,
    ) = request(
        endpoint = OpenApiEndpoints.DEVICE_CURSOR_PUT,
        body = JSONObject()
            .put("recordType", recordType)
            .put("cursor", cursor ?: JSONObject.NULL)
            .put("status", status),
    )

    suspend fun reconcile(
        recordType: String,
        since: Instant,
        presentExternalIds: Set<String>,
    ) {
        val startResponse = request(
            endpoint = OpenApiEndpoints.DEVICE_HEALTH_RECORDS_RECONCILE_START_POST,
            body = JSONObject()
                .put("recordType", recordType)
                .put("since", HealthTime.serialize(since)),
        )
        val reconcileId = JSONObject(startResponse).getString("reconcileId")
        val externalIds = presentExternalIds.toList()
        val maxIds = reconcileBatchLimits.limitFor(recordType)
        val batches = externalIds.chunked(maxIds)
        if (batches.size > 1) {
            syncLog.record(
                SyncLogLevel.INFO,
                SyncEventType.CATEGORY,
                "Reconciling ${externalIds.size} $recordType IDs as ${batches.size} requests with a $maxIds-ID limit",
            )
        }
        batches.forEach { batch ->
            appendReconcileAdaptive(
                recordType = recordType,
                reconcileId = reconcileId,
                externalIds = batch,
            )
        }
        request(
            endpoint = OpenApiEndpoints.DEVICE_HEALTH_RECORDS_RECONCILE_COMPLETE_POST,
            body = JSONObject().put("reconcileId", reconcileId),
        )
    }

    private suspend fun uploadAdaptive(
        recordType: String,
        idempotencyKey: String,
        records: List<TrackItHealthRecord>,
        onRetry: suspend (ApiRetryEvent) -> Unit,
    ) {
        if (records.isEmpty()) return

        try {
            val response = request(
                endpoint = OpenApiEndpoints.DEVICE_HEALTH_RECORDS_POST,
                body = JSONObject()
                    .put("idempotencyKey", idempotencyKey)
                    .put("records", JSONArray(records.map(::toJson))),
                onRetry = onRetry,
            )
            logServerTimings(response)
        } catch (e: HttpResponseException) {
            if (e.statusCode != 413) {
                throw e
            }

            if (records.size == 1) {
                throw IOException(
                    "A single ${records.first().recordType} record is too large for the server. " +
                        e.message,
                    e,
                )
            }

            val reducedLimit = uploadBatchLimits.downgrade(recordType, records.size)
            syncLog.record(
                SyncLogLevel.WARNING,
                SyncEventType.SERVER,
                "$recordType upload limit reduced to $reducedLimit after the server rejected ${records.size} records",
            )

            UploadBatchPlanner.plan(
                idempotencyKey = idempotencyKey,
                records = records,
                maxRecords = reducedLimit,
            ).forEach { batch ->
                uploadAdaptive(
                    recordType = recordType,
                    idempotencyKey = batch.idempotencyKey,
                    records = batch.records,
                    onRetry = onRetry,
                )
            }
        }
    }

    private suspend fun appendReconcileAdaptive(
        recordType: String,
        reconcileId: String,
        externalIds: List<String>,
    ) {
        if (externalIds.isEmpty()) return
        try {
            request(
                endpoint = OpenApiEndpoints.DEVICE_HEALTH_RECORDS_RECONCILE_CHUNK_POST,
                body = JSONObject()
                    .put("reconcileId", reconcileId)
                    .put("presentExternalIds", JSONArray(externalIds)),
            )
        } catch (e: HttpResponseException) {
            if (e.statusCode != 413) throw e
            if (externalIds.size == 1) {
                throw IOException(
                    "A single $recordType reconcile ID is too large for the server. ${e.message}",
                    e,
                )
            }
            val reducedLimit = reconcileBatchLimits.downgrade(recordType, externalIds.size)
            syncLog.record(
                SyncLogLevel.WARNING,
                SyncEventType.SERVER,
                "$recordType reconcile limit reduced to $reducedLimit after the server rejected ${externalIds.size} IDs",
            )
            externalIds.chunked(reducedLimit).forEach { batch ->
                appendReconcileAdaptive(
                    recordType = recordType,
                    reconcileId = reconcileId,
                    externalIds = batch,
                )
            }
        }
    }

    private suspend fun request(
        endpoint: OpenApiEndpoint,
        body: JSONObject,
        onRetry: suspend (ApiRetryEvent) -> Unit = {},
    ): String = withContext(Dispatchers.IO) {
        var lastError: IOException? = null

        repeat(MAX_ATTEMPTS) { zeroBasedAttempt ->
            val attempt = zeroBasedAttempt + 1

            try {
                val startedAt = System.nanoTime()
                val response = performRequest(endpoint, body)
                Log.i(
                    PERF_LOG_TAG,
                    "api path=${endpoint.path} attempt=$attempt durationMs=${elapsedMs(startedAt)}",
                )
                if (attempt > 1) {
                    syncLog.record(
                        SyncLogLevel.INFO,
                        SyncEventType.RETRY,
                        "${endpoint.path} recovered on attempt $attempt",
                    )
                }
                return@withContext response
            } catch (e: HttpResponseException) {
                lastError = e
                val decision = ApiRetryPolicy.forHttp(
                    statusCode = e.statusCode,
                    retryAfterMillis = e.retryAfterMillis,
                    zeroBasedAttempt = zeroBasedAttempt,
                )
                val detail = sanitizeErrorBody(e.responseBody)

                if (decision == null) {
                    syncLog.record(
                        SyncLogLevel.ERROR,
                        SyncEventType.SERVER,
                        "${endpoint.path} failed with HTTP ${e.statusCode}",
                        detail = detail.takeIf { it.isNotBlank() },
                    )
                    throw e
                }

                if (attempt == MAX_ATTEMPTS) {
                    syncLog.record(
                        SyncLogLevel.ERROR,
                        SyncEventType.SERVER,
                        "${endpoint.path} failed after $MAX_ATTEMPTS attempts",
                        detail = "HTTP ${e.statusCode}${detail.takeIf { it.isNotBlank() }?.let { ": $it" }.orEmpty()}",
                    )
                    throw e
                }

                val event = ApiRetryEvent(
                    reason = decision.reason,
                    retryAfterMillis = decision.delayMillis,
                    attempt = attempt,
                    maxAttempts = MAX_ATTEMPTS,
                )
                syncLog.record(
                    SyncLogLevel.WARNING,
                    SyncEventType.RETRY,
                    "${endpoint.path}: ${event.reason}; retry ${attempt + 1}/$MAX_ATTEMPTS in ${formatDelay(decision.delayMillis)}",
                    detail = "HTTP ${e.statusCode}${detail.takeIf { it.isNotBlank() }?.let { ": $it" }.orEmpty()}",
                )
                onRetry(event)
                delay(decision.delayMillis)
            } catch (e: IOException) {
                lastError = e
                val decision = ApiRetryPolicy.forIo(
                    unknownHost = e is UnknownHostException,
                    zeroBasedAttempt = zeroBasedAttempt,
                )

                if (attempt == MAX_ATTEMPTS) {
                    syncLog.record(
                        SyncLogLevel.ERROR,
                        SyncEventType.NETWORK,
                        "${endpoint.path}: ${decision.reason} after $MAX_ATTEMPTS attempts",
                        detail = e.message ?: "I/O error",
                    )
                    throw e
                }

                val event = ApiRetryEvent(
                    reason = decision.reason,
                    retryAfterMillis = decision.delayMillis,
                    attempt = attempt,
                    maxAttempts = MAX_ATTEMPTS,
                )
                syncLog.record(
                    SyncLogLevel.WARNING,
                    SyncEventType.NETWORK,
                    "${endpoint.path}: ${event.reason}; retry ${attempt + 1}/$MAX_ATTEMPTS in ${formatDelay(decision.delayMillis)}",
                    detail = e.message ?: "I/O error",
                )
                onRetry(event)
                delay(decision.delayMillis)
            }
        }

        throw lastError ?: IllegalStateException("Request failed")
    }

    private fun performRequest(
        endpoint: OpenApiEndpoint,
        body: JSONObject,
    ): String {
        val timestamp = System.currentTimeMillis().toString()

        val nonce = ByteArray(24)
            .also(secureRandom::nextBytes)
            .let {
                Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(it)
            }

        val bodyBytes = body.toString().toByteArray(Charsets.UTF_8)
        val bodyHash = sha256Hex(bodyBytes)

        val deviceId =
            credentials.read("deviceId")
                ?: throw IllegalStateException("Missing deviceId")

        val credential =
            credentials.read("credential")
                ?: throw IllegalStateException("Missing credential")

        val serverUrl =
            credentials.read("serverUrl")
                ?: throw IllegalStateException("Missing serverUrl")

        val canonical = listOf(
            endpoint.method,
            endpoint.path,
            timestamp,
            nonce,
            bodyHash,
            deviceId,
        ).joinToString("\n")

        val signer = Signature
            .getInstance("SHA256withECDSA")
            .apply {
                initSign(
                    keyStore.getKey(
                        PairingClient.KEY_ALIAS,
                        null,
                    ) as PrivateKey,
                )
                update(canonical.toByteArray(Charsets.UTF_8))
            }

        val signature = Base64
            .getUrlEncoder()
            .withoutPadding()
            .encodeToString(signer.sign())

        val connection = URI(
            "${serverUrl.trimEnd('/')}${endpoint.path}",
        ).toURL().openConnection() as HttpURLConnection

        try {
            connection.requestMethod = endpoint.method
            connection.connectTimeout = 15_000
            connection.readTimeout = 60_000
            connection.setRequestProperty(
                "Authorization",
                "Bearer $credential",
            )
            connection.setRequestProperty(
                "X-Device-Timestamp",
                timestamp,
            )
            connection.setRequestProperty(
                "X-Device-Nonce",
                nonce,
            )
            connection.setRequestProperty(
                "X-Device-Id",
                deviceId,
            )
            connection.setRequestProperty(
                "X-Device-Signature",
                signature,
            )
            connection.setRequestProperty(
                "Content-Type",
                "application/json",
            )
            connection.doOutput = true

            connection.outputStream.use {
                it.write(bodyBytes)
            }

            val responseCode = connection.responseCode

            if (responseCode !in 200..299) {
                val responseBody = connection.errorStream
                    ?.bufferedReader(Charsets.UTF_8)
                    ?.use { it.readText() }
                    .orEmpty()

                throw HttpResponseException(
                    statusCode = responseCode,
                    responseBody = responseBody,
                    retryAfterMillis = if (responseCode == 429) {
                        retryAfterMillis(connection)
                    } else {
                        null
                    },
                )
            }

            return connection.inputStream
                ?.bufferedReader(Charsets.UTF_8)
                ?.use { it.readText() }
                .orEmpty()
        } finally {
            connection.disconnect()
        }
    }

    private fun sha256Hex(value: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value)
        val result = CharArray(digest.size * 2)
        digest.forEachIndexed { index, byte ->
            val unsigned = byte.toInt() and 0xff
            result[index * 2] = HEX[unsigned ushr 4]
            result[index * 2 + 1] = HEX[unsigned and 0x0f]
        }
        return result.concatToString()
    }

    private fun logServerTimings(response: String) {
        if (response.isBlank()) return
        runCatching {
            val json = JSONObject(response)
            if (!json.has("timings")) return@runCatching
            Log.i(PERF_LOG_TAG, "server ${json.getJSONObject("timings")}")
        }
    }

    private fun elapsedMs(startedAt: Long): Long =
        (System.nanoTime() - startedAt) / 1_000_000L

    private fun retryAfterMillis(
        connection: HttpURLConnection,
    ): Long {
        val value = connection.getHeaderField("Retry-After")?.trim()
        val seconds = value?.toLongOrNull()

        if (seconds != null) {
            return (seconds * 1_000L).coerceIn(1_000L, 300_000L)
        }

        val dateDelay = runCatching {
            val target = ZonedDateTime.parse(
                value,
                DateTimeFormatter.RFC_1123_DATE_TIME,
            )
                .toInstant()
                .toEpochMilli()

            target - System.currentTimeMillis()
        }.getOrNull()

        return (dateDelay ?: 30_000L).coerceIn(1_000L, 300_000L)
    }

    private fun sanitizeErrorBody(value: String): String = value
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(300)

    private fun formatDelay(value: Long): String =
        if (value < 1_000L) "$value ms" else "${(value + 999L) / 1_000L}s"

    private fun toJson(
        record: TrackItHealthRecord,
    ) = JSONObject()
        .put("provider", record.provider)
        .put("recordType", record.recordType)
        .put("externalId", record.externalId)
        .put("externalVersion", record.externalVersion)
        .put("startTime", record.startTime)
        .put("endTime", record.endTime)
        .put("dataOrigin", record.dataOrigin)
        .put("recordingMethod", record.recordingMethod)
        .put("device", record.device)
        .put("payload", record.payload)
        .put("lastModifiedTime", record.lastModifiedTime)
        .put("deleted", record.deleted)
}
