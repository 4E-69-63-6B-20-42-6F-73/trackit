package net.trackit.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

enum class SyncLogLevel {
    INFO,
    WARNING,
    ERROR,
}

data class SyncLogEntry(
    val timestamp: Long,
    val level: SyncLogLevel,
    val message: String,
)

class SyncLogStore(context: Context) {
    private val preferences = context.getSharedPreferences("trackit-sync-log", Context.MODE_PRIVATE)

    @Synchronized
    fun info(message: String) = append(SyncLogLevel.INFO, message)

    @Synchronized
    fun warning(message: String) = append(SyncLogLevel.WARNING, message)

    @Synchronized
    fun error(message: String) = append(SyncLogLevel.ERROR, message)

    @Synchronized
    fun entries(): List<SyncLogEntry> = decode(preferences.getString(KEY_ENTRIES, null))
        .sortedByDescending { it.timestamp }

    @Synchronized
    fun clear() {
        preferences.edit().remove(KEY_ENTRIES).apply()
    }

    private fun append(level: SyncLogLevel, message: String) {
        val existing = decode(preferences.getString(KEY_ENTRIES, null)).toMutableList()
        existing += SyncLogEntry(
            timestamp = System.currentTimeMillis(),
            level = level,
            message = message.take(MAX_MESSAGE_LENGTH),
        )
        val trimmed = existing.takeLast(MAX_ENTRIES)
        preferences.edit().putString(KEY_ENTRIES, encode(trimmed)).apply()
    }

    private fun encode(entries: List<SyncLogEntry>): String {
        val array = JSONArray()
        entries.forEach { entry ->
            array.put(
                JSONObject()
                    .put("timestamp", entry.timestamp)
                    .put("level", entry.level.name)
                    .put("message", entry.message),
            )
        }
        return array.toString()
    }

    private fun decode(value: String?): List<SyncLogEntry> {
        if (value.isNullOrBlank()) return emptyList()
        return runCatching {
            val array = JSONArray(value)
            buildList {
                repeat(array.length()) { index ->
                    val item = array.getJSONObject(index)
                    add(
                        SyncLogEntry(
                            timestamp = item.getLong("timestamp"),
                            level = SyncLogLevel.valueOf(item.getString("level")),
                            message = item.getString("message"),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    companion object {
        private const val KEY_ENTRIES = "entries"
        private const val MAX_ENTRIES = 200
        private const val MAX_MESSAGE_LENGTH = 1000
    }
}
