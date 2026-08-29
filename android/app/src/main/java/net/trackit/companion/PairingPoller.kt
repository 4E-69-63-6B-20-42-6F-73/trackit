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
        deviceId: String,
        serverUrl: String,
        credential: String,
        keyFingerprint: String,
        serverIdentity: String,
        maxPolls: Int = 60,
        pollIntervalMs: Long = 5000,
    ): PairingResult = withContext(Dispatchers.IO) {
        for (attempt in 0 until maxPolls) {
            val lastAttempt = attempt == maxPolls - 1
            val result = try {
                checkPairingStatus(
                    deviceId,
                    serverUrl,
                    credential,
                    keyFingerprint,
                    serverIdentity,
                )
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

        PairingResult.Pending(
            deviceId = deviceId,
            credential = credential,
            keyFingerprint = keyFingerprint,
            serverIdentity = serverIdentity,
        )
    }

    private fun checkPairingStatus(
        deviceId: String,
        serverUrl: String,
        credential: String,
        keyFingerprint: String,
        serverIdentity: String,
    ): PairingResult {
        val connection = URI("${serverUrl.trimEnd('/')}/api/device/status")
            .toURL()
            .openConnection() as HttpURLConnection

        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Authorization", "Bearer $credential")
        connection.setRequestProperty("X-Device-Key-Fingerprint", keyFingerprint)
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

            when {
                responseCode in 200..299 && response != null -> {
                    val device = response.optJSONObject("data")
                    val returnedDeviceId = device?.optString("id").orEmpty()
                    val status = device?.optString("status").orEmpty()

                    if (returnedDeviceId != deviceId) {
                        PairingResult.Failure(
                            message = "Pairing status returned a different device",
                            serverIdentity = null,
                        )
                    } else if (status == "confirmed") {
                        PairingResult.Success(
                            deviceId = deviceId,
                            credential = credential,
                            keyFingerprint = keyFingerprint,
                            serverIdentity = serverIdentity,
                        )
                    } else if (status == "revoked") {
                        PairingResult.Failure(
                            message = "Pairing request was rejected",
                            serverIdentity = null,
                        )
                    } else {
                        PairingResult.Pending(
                            deviceId = deviceId,
                            credential = credential,
                            keyFingerprint = keyFingerprint,
                            serverIdentity = serverIdentity,
                        )
                    }
                }
                responseCode == 401 || responseCode == 404 -> PairingResult.Failure(
                    message = "Pairing request is no longer available",
                    serverIdentity = null,
                )
                responseCode in setOf(500, 502, 503, 504) -> PairingResult.Failure(
                    message = RETRYABLE_SERVER_ERROR,
                    serverIdentity = null,
                )
                else -> PairingResult.Failure(
                    message = "Unexpected pairing status response ($responseCode)",
                    serverIdentity = null,
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
