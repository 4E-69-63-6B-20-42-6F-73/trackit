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
            connection.doOutput = true
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            val responseCode = connection.responseCode
            val responseText = connection.inputStream.bufferedReader().readText()
            val response = JSONObject(responseText)
            val serverIdentityInResponse = response.getString("serverIdentity")

                when (responseCode) {
                    202 -> {
                        // Success - waiting for web confirmation
                        val pairingResult = PairingResult.Failure(
                            message = "Waiting for confirmation in TrackIt",
                            serverIdentity = serverIdentityInResponse,
                        )
                        return@withContext pairingResult
                    }
                    401 -> {
                        // Check for specific error types
                        val errorType = if (response.has("error")) response.getString("error") else null
                        val reason = when (errorType) {
                            "expired" -> "Pairing code has expired. Please generate a new code."
                            "invalid" -> "Invalid or expired pairing code. Please check the code and try again."
                            "already_paired" -> "This device is already paired. Use a new pairing code."
                            else -> if (response.has("error_details")) {
                                val details = JSONObject(response.getString("error_details"))
                                val msg = details.optString("message", null)
                                when (val err = details.optString("error", null)) {
                                    "identity_mismatch" -> "Server identity mismatch. Verify the server address and identity."
                                    "unreachable" -> "Server unreachable. Check your connection and try again."
                                    "tls_error" -> "TLS certificate error. Verify the server connection is secure."
                                    else -> msg ?: "Invalid or expired pairing code."
                                }
                            } else {
                                "Invalid or expired pairing code"
                            }
                        }
                        val pairingResult = PairingResult.Failure(
                            message = reason,
                            serverIdentity = null,
                        )
                        return@withContext pairingResult
                    }
                    400 -> {
                        // Bad request - invalid format or missing fields
                        val pairingResult = PairingResult.Failure(
                            message = "Invalid pairing request. Please check the code and try again.",
                            serverIdentity = null,
                        )
                        return@withContext pairingResult
                    }
                    409 -> {
                        // Conflict - server identity mismatch
                        val pairingResult = PairingResult.Failure(
                            message = "Server identity mismatch. Please verify the server address and identity.",
                            serverIdentity = serverIdentityInResponse,
                        )
                        return@withContext pairingResult
                    }
                    500, 502, 503, 504 -> {
                        // Server errors
                        val pairingResult = PairingResult.Failure(
                            message = "Server error. The server may be unavailable or overloaded.",
                            serverIdentity = null,
                        )
                        return@withContext pairingResult
                    }
                    else -> {
                        // Other errors - network issues, timeout, etc.
                        val pairingResult = PairingResult.Failure(
                            message = "Connection failed. Please check your internet connection and try again.",
                            serverIdentity = null,
                        )
                        return@withContext pairingResult
                    }
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
    ) : PairingResult() {
        val success = true
    }
    data class Failure(
        val message: String,
        val serverIdentity: String?,
    ) : PairingResult() {
        val success = false
    }
}
