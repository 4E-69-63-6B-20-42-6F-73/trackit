package net.trackit.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

enum class SyncLogLevel {
    INFO,
    WARNING,
    ERROR,
}

enum class SyncEventType {
    GENERAL,
    SYNC_STARTED,
    SYNC_COMPLETED,
    CATEGORY,
    RETRY,
    PERMISSION,
    NETWORK,
    SERVER,
    BACKGROUND,
    CANCELLED,
    PAIRING,
    RESET,
}

data class SyncLogEntry(
    val timestamp: Long,
    val level: SyncLogLevel,
    val type: SyncEventType,
    val message: String,
    val category: String? = null,
    val detail: String? = null,
)

class SyncLogStore(context: Context) {
    private val preferences = context.getSharedPreferences("trackit-sync-log", Context.MODE_PRIVATE)

    @Synchronized
    fun record(
        level: SyncLogLevel,
        type: SyncEventType,
        message: String,
        category: String? = null,
        detail: String? = null,
    ) = append(
        SyncLogEntry(
            timestamp = System.currentTimeMillis(),
            level = level,
            type = type,
            message = message.take(MAX_MESSAGE_LENGTH),
            category = category?.take(MAX_CATEGORY_LENGTH),
            detail = detail?.take(MAX_DETAIL_LENGTH),
        ),
    )

    @Synchronized
    fun info(message: String) = record(SyncLogLevel.INFO, SyncEventType.GENERAL, message)

    @Synchronized
    fun warning(message: String) = record(SyncLogLevel.WARNING, SyncEventType.GENERAL, message)

    @Synchronized
    fun error(message: String) = record(SyncLogLevel.ERROR, SyncEventType.GENERAL, message)

    @Synchronized
    fun entries(): List<SyncLogEntry> = decode(preferences.getString(KEY_ENTRIES, null))
        .sortedByDescending { it.timestamp }

    @Synchronized
    fun clear() {
        preferences.edit().remove(KEY_ENTRIES).apply()
    }

    private fun append(entry: SyncLogEntry) {
        val existing = decode(preferences.getString(KEY_ENTRIES, null)).toMutableList()
        existing += entry
        preferences.edit().putString(KEY_ENTRIES, encode(existing.takeLast(MAX_ENTRIES))).apply()
    }

    private fun encode(entries: List<SyncLogEntry>): String {
        val array = JSONArray()
        entries.forEach { entry ->
            array.put(
                JSONObject()
                    .put("timestamp", entry.timestamp)
                    .put("level", entry.level.name)
                    .put("type", entry.type.name)
                    .put("message", entry.message)
                    .put("category", entry.category)
                    .put("detail", entry.detail),
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
                            type = runCatching {
                                SyncEventType.valueOf(item.optString("type", SyncEventType.GENERAL.name))
                            }.getOrDefault(SyncEventType.GENERAL),
                            message = item.getString("message"),
                            category = item.optString("category").takeIf { it.isNotBlank() && it != "null" },
                            detail = item.optString("detail").takeIf { it.isNotBlank() && it != "null" },
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    companion object {
        private const val KEY_ENTRIES = "entries"
        private const val MAX_ENTRIES = 250
        private const val MAX_MESSAGE_LENGTH = 500
        private const val MAX_CATEGORY_LENGTH = 100
        private const val MAX_DETAIL_LENGTH = 1000
    }
}
