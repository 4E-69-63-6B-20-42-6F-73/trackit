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
        maxPolls: Int = 60,
        pollIntervalMs: Long = 5000,
    ): PairingResult = withContext(Dispatchers.IO) {
        for (attempt in 0 until maxPolls) {
            val lastAttempt = attempt == maxPolls - 1
            val result = try {
                checkPairingStatus(deviceId, serverUrl)
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
            serverIdentity = "",
        )
    }

    private fun checkPairingStatus(
        deviceId: String,
        serverUrl: String,
    ): PairingResult {
        val connection = URI("${serverUrl.trimEnd('/')}/api/devices/$deviceId/status")
            .toURL()
            .openConnection() as HttpURLConnection

        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
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
                    val confirmed = response.optBoolean("confirmed", false)
                    val credential = response.optString("credential").takeIf { it.isNotBlank() }
                    val serverIdentity = response.optString("serverIdentity").takeIf { it.isNotBlank() }

                    if (confirmed && credential != null && serverIdentity != null) {
                        PairingResult.Success(
                            deviceId = deviceId,
                            credential = credential,
                            serverIdentity = serverIdentity,
                        )
                    } else {
                        PairingResult.Pending(
                            deviceId = deviceId,
                            serverIdentity = serverIdentity.orEmpty(),
                        )
                    }
                }
                responseCode == 404 -> PairingResult.Failure(
                    message = "Pairing request was not found",
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
