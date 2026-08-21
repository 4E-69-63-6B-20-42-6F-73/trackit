package net.trackit.companion

import android.content.Context
import java.net.HttpURLConnection
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.Signature
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class HealthUpload(
    val externalId: String,
    val metric: String,
    val value: Double,
    val unit: String,
    val observedAt: String,
    val endedAt: String?,
    val version: Long,
    val dataOrigin: String,
    val deleted: Boolean = false,
)

class TrackItApi(context: Context) {
    private val credentials = CredentialStore(context)

    suspend fun upload(idempotencyKey: String, records: List<HealthUpload>) = request(
        "/api/device/upload",
        JSONObject()
            .put("idempotencyKey", idempotencyKey)
            .put("records", JSONArray(records.map(::toJson))),
    )

    suspend fun updateCursor(recordType: String, cursor: String?, status: String) = request(
        "/api/device/cursor",
        JSONObject().put("recordType", recordType).put("cursor", cursor).put("status", status),
        method = "PUT",
    )

    private suspend fun request(path: String, body: JSONObject, method: String = "POST") =
        withContext(Dispatchers.IO) {
            val timestamp = System.currentTimeMillis().toString()
            val nonce = ByteArray(24).also { SecureRandom().nextBytes(it) }
                .let { Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
            val bodyBytes = body.toString().toByteArray(Charsets.UTF_8)
            val bodyHash = MessageDigest.getInstance("SHA-256").digest(bodyBytes)
                .joinToString("") { "%02x".format(it) }
            val deviceId = credentials.read("deviceId")!!
            val canonical = listOf(method.uppercase(), path, timestamp, nonce, bodyHash, deviceId)
                .joinToString("\n")
            val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
            val signer = Signature.getInstance("SHA256withECDSA").apply {
                initSign(store.getKey(PairingClient.KEY_ALIAS, null) as java.security.PrivateKey)
                update(canonical.toByteArray(Charsets.UTF_8))
            }
            val signature = Base64.getUrlEncoder().withoutPadding().encodeToString(signer.sign())
            val connection = URI("${credentials.read("serverUrl")!!.trimEnd('/')}$path").toURL()
                .openConnection() as HttpURLConnection
            connection.requestMethod = method
            connection.setRequestProperty("Authorization", "Bearer ${credentials.read("credential")}")
            connection.setRequestProperty("X-Device-Timestamp", timestamp)
            connection.setRequestProperty("X-Device-Nonce", nonce)
            connection.setRequestProperty("X-Device-Id", deviceId)
            connection.setRequestProperty("X-Device-Signature", signature)
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            connection.outputStream.use { it.write(bodyBytes) }
            require(connection.responseCode in 200..299) { "Upload rejected (${connection.responseCode})" }
        }

    private fun toJson(record: HealthUpload) = JSONObject()
        .put("externalId", record.externalId)
        .put("metric", record.metric)
        .put("value", record.value)
        .put("unit", record.unit)
        .put("observedAt", record.observedAt)
        .put("endedAt", record.endedAt)
        .put("version", record.version)
        .put("dataOrigin", record.dataOrigin)
        .put("deleted", record.deleted)
}
