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
    suspend fun pair(serverUrl: String, serverIdentity: String, code: String) = withContext(Dispatchers.IO) {
        require(URI(serverUrl).scheme == "https") { "HTTPS is required" }
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
        require(connection.responseCode == 202) { "Server rejected pairing" }
        val response = JSONObject(connection.inputStream.bufferedReader().readText())
        require(response.getString("serverIdentity") == serverIdentity) { "Server identity changed" }
        CredentialStore(context).save(
            serverUrl,
            response.getString("deviceId"),
            response.getString("credential"),
            deviceKey.fingerprint,
        )
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
