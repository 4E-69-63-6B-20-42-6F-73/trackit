package net.trackit.companion

import java.net.HttpURLConnection
import java.net.URI
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject

class PairingPoller {
    suspend fun pollForConfirmation(
        pending: PairingResult.Pending,
        serverUrl: String,
        maxPolls: Int = 60,
        pollIntervalMs: Long = 5000,
    ): PairingResult = withContext(Dispatchers.IO) {
        for (attempt in 0 until maxPolls) {
            val lastAttempt = attempt == maxPolls - 1
            val result = try {
                checkPairingStatus(pending, serverUrl)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                if (lastAttempt) {
                    return@withContext PairingResult.Failure(
                        message = "Connection error during pairing confirmation",
                        serverIdentity = null,
                    )
                }
                delay(pollIntervalMs)
                continue
            }

            when (result) {
                is PairingResult.Success -> return@withContext result
                is PairingResult.Pending -> {
                    if (!lastAttempt) {
                        delay(pollIntervalMs)
                    }
                }
                is PairingResult.Failure -> {
                    if (result.message == RETRYABLE_SERVER_ERROR && !lastAttempt) {
                        delay(pollIntervalMs)
                    } else {
                        return@withContext result
                    }
                }
            }
        }

        pending
    }

    private fun checkPairingStatus(
        pending: PairingResult.Pending,
        serverUrl: String,
    ): PairingResult {
        val endpoint = OpenApiEndpoints.DEVICE_STATUS_GET
        val connection = URI("${serverUrl.trimEnd('/')}${endpoint.path}")
            .toURL()
            .openConnection() as HttpURLConnection

        connection.requestMethod = endpoint.method
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Authorization", "Bearer ${pending.credential}")
        connection.setRequestProperty("X-Device-Key-Fingerprint", pending.keyFingerprint)
        connection.connectTimeout = 10_000
        connection.readTimeout = 10_000

        return try {
            val responseCode = connection.responseCode
            val responseText = (if (responseCode in 200..299) {
                connection.inputStream
            } else {
                connection.errorStream
            })
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            val response = responseText.takeIf { it.isNotBlank() }?.let(::JSONObject)
            val device = response?.optJSONObject("data")

            when {
                responseCode in 200..299 && device != null -> {
                    val returnedId = device.optString("id").takeIf { it.isNotBlank() }
                    val status = device.optString("status").takeIf { it.isNotBlank() }
                    when {
                        returnedId != null && returnedId != pending.deviceId -> PairingResult.Failure(
                            message = "The server returned a different device during pairing.",
                            serverIdentity = pending.serverIdentity,
                        )
                        status == "confirmed" || status == "active" -> PairingResult.Success(
                            deviceId = pending.deviceId,
                            credential = pending.credential,
                            serverIdentity = pending.serverIdentity,
                        )
                        status == "pending" -> pending
                        status == "revoked" -> PairingResult.Failure(
                            message = "The pairing request was rejected.",
                            serverIdentity = pending.serverIdentity,
                        )
                        else -> PairingResult.Failure(
                            message = "Unexpected pairing status from server.",
                            serverIdentity = pending.serverIdentity,
                        )
                    }
                }
                responseCode == 401 -> PairingResult.Failure(
                    message = "Pairing credentials were rejected by the server.",
                    serverIdentity = pending.serverIdentity,
                )
                responseCode in setOf(500, 502, 503, 504) -> PairingResult.Failure(
                    message = RETRYABLE_SERVER_ERROR,
                    serverIdentity = pending.serverIdentity,
                )
                else -> PairingResult.Failure(
                    message = "Unexpected pairing status response ($responseCode)",
                    serverIdentity = pending.serverIdentity,
                )
            }
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        const val RETRYABLE_SERVER_ERROR = "Server temporarily unavailable"
    }
}
