package net.trackit.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.net.HttpURLConnection
import java.net.URI
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class PairingClient(private val context: Context) {
    suspend fun pair(serverUrl: String, serverIdentity: String, code: String): PairingResult =
        withContext(Dispatchers.IO) {
            val deviceKey = deviceKey()
            val body = JSONObject()
                .put("code", code)
                .put("name", android.os.Build.MODEL)
                .put("keyFingerprint", deviceKey.fingerprint)
                .put("publicKey", deviceKey.publicKey)
                .put("serverIdentity", serverIdentity)
            val connection = URI("${serverUrl.trimEnd('/')}/api/devices/pair/request").toURL()
                .openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 15_000
            connection.readTimeout = 15_000
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }

            val responseCode = connection.responseCode
            val responseText = (if (responseCode in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()
                ?.use { it.readText() }
                .orEmpty()
            val response = responseText.takeIf { it.isNotBlank() }?.let(::JSONObject)
            val serverIdentityInResponse = response
                ?.optString("serverIdentity")
                ?.takeIf { it.isNotBlank() }

            when {
                responseCode in 200..299 &&
                    response != null &&
                    response.has("deviceId") &&
                    response.has("credential") &&
                    serverIdentityInResponse != null -> PairingResult.Success(
                    deviceId = response.getString("deviceId"),
                    credential = response.getString("credential"),
                    serverIdentity = serverIdentityInResponse,
                )

                responseCode == 202 -> {
                    val deviceId = response?.optString("deviceId") ?: ""
                    PairingResult.Pending(
                        deviceId = deviceId,
                        serverIdentity = serverIdentityInResponse ?: "",
                    )
                }

                responseCode == 401 -> {
                    val errorType = response?.optString("error")?.takeIf { it.isNotBlank() }
                    val reason = when (errorType) {
                        "expired" -> "Pairing code has expired. Please generate a new code."
                        "invalid" -> "Invalid or expired pairing code. Please check the code and try again."
                        "already_paired" -> "This device is already paired. Use a new pairing code."
                        else -> response?.optString("message")?.takeIf { it.isNotBlank() }
                            ?: "Invalid or expired pairing code."
                    }
                    PairingResult.Failure(reason, null)
                }

                responseCode == 400 -> PairingResult.Failure(
                    message = "Invalid pairing request. Please check the code and try again.",
                    serverIdentity = null,
                )

                responseCode == 409 -> PairingResult.Failure(
                    message = "Server identity mismatch. Please verify the server address and identity.",
                    serverIdentity = serverIdentityInResponse,
                )

                responseCode in setOf(500, 502, 503, 504) -> PairingResult.Failure(
                    message = "Server error. The server may be unavailable or overloaded.",
                    serverIdentity = null,
                )

                else -> PairingResult.Failure(
                    message = "Connection failed (${responseCode}). Please check your connection and try again.",
                    serverIdentity = null,
                )
            }
        }

    private fun deviceKey(): DeviceKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!store.containsAlias(KEY_ALIAS)) {
            val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore")
            generator.initialize(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY)
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .build(),
            )
            generator.generateKeyPair()
        }
        val encoded = store.getCertificate(KEY_ALIAS).publicKey.encoded
        val digest = MessageDigest.getInstance("SHA-256").digest(encoded)
        return DeviceKey(
            Base64.getUrlEncoder().withoutPadding().encodeToString(digest),
            Base64.getEncoder().encodeToString(encoded),
        )
    }

    private data class DeviceKey(val fingerprint: String, val publicKey: String)

    companion object { const val KEY_ALIAS = "trackit-device-key" }
}

sealed class PairingResult {
    data class Success(
        val deviceId: String,
        val credential: String,
        val serverIdentity: String,
    ) : PairingResult()

    data class Pending(
        val deviceId: String,
        val serverIdentity: String,
    ) : PairingResult()

    data class Failure(
        val message: String,
        val serverIdentity: String?,
        val serverUrl: String? = null,
        val code: String? = null,
    ) : PairingResult()
}
