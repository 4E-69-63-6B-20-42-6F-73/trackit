package net.trackit.companion

import android.content.Context
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.UnknownHostException
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.time.ZonedDateTime
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Base64
import java.util.UUID
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
    }

    private val credentials = CredentialStore(context)

    suspend fun upload(
        idempotencyKey: String,
        records: List<TrackItHealthRecord>,
        onRetry: suspend (ApiRetryEvent) -> Unit = {},
    ) {
        uploadAdaptive(
            idempotencyKey = idempotencyKey,
            records = records,
            onRetry = onRetry,
        )
    }

    suspend fun updateCursor(
        recordType: String,
        cursor: String?,
        status: String,
    ) = request(
        path = "/api/device/cursor",
        body = JSONObject()
            .put("recordType", recordType)
            .put("cursor", cursor)
            .put("status", status),
        method = "PUT",
    )

    suspend fun reconcile(
        recordType: String,
        since: Instant,
        presentExternalIds: Set<String>,
    ) = request(
        path = "/api/device/health-records/reconcile",
        body = JSONObject()
            .put("recordType", recordType)
            .put("since", HealthTime.serialize(since))
            .put("presentExternalIds", JSONArray(presentExternalIds.toList())),
    )

    private suspend fun uploadAdaptive(
        idempotencyKey: String,
        records: List<TrackItHealthRecord>,
        onRetry: suspend (ApiRetryEvent) -> Unit,
    ) {
        if (records.isEmpty()) return

        try {
            request(
                path = "/api/device/health-records",
                body = JSONObject()
                    .put("idempotencyKey", idempotencyKey)
                    .put("records", JSONArray(records.map(::toJson))),
                onRetry = onRetry,
            )
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

            val midpoint = records.size / 2
            val first = records.subList(0, midpoint)
            val second = records.subList(midpoint, records.size)

            uploadAdaptive(
                idempotencyKey = UUID.randomUUID().toString(),
                records = first,
                onRetry = onRetry,
            )

            uploadAdaptive(
                idempotencyKey = UUID.randomUUID().toString(),
                records = second,
                onRetry = onRetry,
            )
        }
    }

    private suspend fun request(
        path: String,
        body: JSONObject,
        method: String = "POST",
        onRetry: suspend (ApiRetryEvent) -> Unit = {},
    ) = withContext(Dispatchers.IO) {
        var lastError: IOException? = null

        repeat(MAX_ATTEMPTS) { zeroBasedAttempt ->
            val attempt = zeroBasedAttempt + 1

            try {
                performRequest(path, body, method)
                return@withContext
            } catch (e: HttpResponseException) {
                lastError = e

                val retryDelay =
                    when {
                        e.statusCode == 429 ->
                            e.retryAfterMillis ?: 30_000L

                        e.statusCode in 500..599 ->
                            e.retryAfterMillis
                                ?: (1_000L shl zeroBasedAttempt.coerceAtMost(4))

                        else ->
                            throw e
                    }

                if (attempt == MAX_ATTEMPTS) {
                    throw e
                }

                onRetry(
                    ApiRetryEvent(
                        reason = when {
                            e.statusCode == 429 ->
                                "Server is busy"

                            e.statusCode in 500..599 ->
                                "Server is temporarily unavailable"

                            else ->
                                "Request failed"
                        },
                        retryAfterMillis = retryDelay,
                        attempt = attempt,
                        maxAttempts = MAX_ATTEMPTS,
                    ),
                )

                delay(retryDelay)
            } catch (e: IOException) {
                lastError = e

                if (attempt == MAX_ATTEMPTS) {
                    throw e
                }

                val retryDelay =
                    1_000L shl zeroBasedAttempt.coerceAtMost(4)

                onRetry(
                    ApiRetryEvent(
                        reason =
                            if (e is UnknownHostException) {
                                "Can't resolve the server address"
                            } else {
                                "Connection interrupted"
                            },
                        retryAfterMillis = retryDelay,
                        attempt = attempt,
                        maxAttempts = MAX_ATTEMPTS,
                    ),
                )

                delay(retryDelay)
            }
        }

        throw lastError ?: IllegalStateException("Request failed")
    }

    private fun performRequest(
        path: String,
        body: JSONObject,
        method: String,
    ) {
        val timestamp = System.currentTimeMillis().toString()

        val nonce = ByteArray(24)
            .also { SecureRandom().nextBytes(it) }
            .let {
                Base64.getUrlEncoder()
                    .withoutPadding()
                    .encodeToString(it)
            }

        val bodyBytes =
            body.toString().toByteArray(Charsets.UTF_8)

        val bodyHash = MessageDigest
            .getInstance("SHA-256")
            .digest(bodyBytes)
            .joinToString("") { "%02x".format(it) }

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
            method.uppercase(),
            path,
            timestamp,
            nonce,
            bodyHash,
            deviceId,
        ).joinToString("\n")

        val store = KeyStore
            .getInstance("AndroidKeyStore")
            .apply { load(null) }

        val signer = Signature
            .getInstance("SHA256withECDSA")
            .apply {
                initSign(
                    store.getKey(
                        PairingClient.KEY_ALIAS,
                        null,
                    ) as java.security.PrivateKey,
                )
                update(
                    canonical.toByteArray(Charsets.UTF_8),
                )
            }

        val signature = Base64
            .getUrlEncoder()
            .withoutPadding()
            .encodeToString(signer.sign())

        val connection = URI(
            "${serverUrl.trimEnd('/')}$path",
        ).toURL().openConnection() as HttpURLConnection

        try {
            connection.requestMethod = method
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

            val responseCode =
                connection.responseCode

            if (responseCode !in 200..299) {
                val responseBody =
                    connection.errorStream
                        ?.bufferedReader(Charsets.UTF_8)
                        ?.use { it.readText() }
                        .orEmpty()

                throw HttpResponseException(
                    statusCode = responseCode,
                    responseBody = responseBody,
                    retryAfterMillis =
                        if (responseCode == 429) {
                            retryAfterMillis(connection)
                        } else {
                            null
                        },
                )
            }

            connection.inputStream
                ?.use { it.readBytes() }
        } finally {
            connection.disconnect()
        }
    }

    private fun retryAfterMillis(
        connection: HttpURLConnection,
    ): Long {
        val value =
            connection.getHeaderField("Retry-After")
                ?.trim()

        val seconds =
            value?.toLongOrNull()

        if (seconds != null) {
            return (seconds * 1_000L)
                .coerceIn(1_000L, 300_000L)
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

        return (dateDelay ?: 30_000L)
            .coerceIn(1_000L, 300_000L)
    }

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
