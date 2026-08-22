package net.trackit.companion

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.spec.GCMParameterSpec

class CredentialStore(context: Context) {
    private val preferences = context.getSharedPreferences("trackit-private", Context.MODE_PRIVATE)

    fun save(serverUrl: String, deviceId: String, credential: String, fingerprint: String) {
        preferences.edit()
            .putString("serverUrl", serverUrl)
            .putString("deviceId", deviceId)
            .putString("credential", encrypt(credential))
            .putString("fingerprint", fingerprint)
            .apply()
    }

    fun save(serverUrl: String, deviceId: String, credential: String) {
        preferences.edit()
            .putString("serverUrl", serverUrl)
            .putString("deviceId", deviceId)
            .putString("credential", encrypt(credential))
            .apply()
    }

    fun read(key: String): String? = preferences.getString(key, null)?.let {
        if (key == "credential") decrypt(it) else it
    }
    fun cursor(recordType: String): String? = preferences.getString("cursor:$recordType", null)
    fun saveCursor(recordType: String, cursor: String) = preferences.edit().putString("cursor:$recordType", cursor).apply()
    fun saveSelectedRecordTypes(recordTypes: Set<String>) =
        preferences.edit().putStringSet("selectedRecordTypes", recordTypes).apply()
    fun selectedRecordTypes(): Set<String> =
        preferences.getStringSet("selectedRecordTypes", setOf("StepsRecord"))?.toSet()
            ?: setOf("StepsRecord")
    fun saveBackgroundSyncEnabled(enabled: Boolean) =
        preferences.edit().putBoolean("backgroundSyncEnabled", enabled).apply()
    fun backgroundSyncEnabled(): Boolean =
        preferences.getBoolean("backgroundSyncEnabled", false)

    private fun encryptionKey(): javax.crypto.SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(KEY_ALIAS, null) as? javax.crypto.SecretKey
        if (existing != null) return existing
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey())
        return listOf(cipher.iv, cipher.doFinal(value.toByteArray()))
            .joinToString(":") { Base64.getEncoder().encodeToString(it) }
    }

    private fun decrypt(value: String): String {
        val parts = value.split(":").map { Base64.getDecoder().decode(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), GCMParameterSpec(128, parts[0]))
        return String(cipher.doFinal(parts[1]))
    }

    companion object { private const val KEY_ALIAS = "trackit-credential-key" }
}
