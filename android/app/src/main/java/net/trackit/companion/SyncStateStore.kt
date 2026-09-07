package net.trackit.companion

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

class SyncStateStore(context: Context) {
    private val preferences = context.getSharedPreferences("trackit-sync-state", Context.MODE_PRIVATE)

    @Synchronized
    fun categoryStates(): Map<String, CategorySyncUiState> = decodeCategories(
        preferences.getString(KEY_CATEGORIES, null),
    ).associateBy { it.recordType }

    @Synchronized
    fun saveCategory(state: CategorySyncUiState) {
        val states = categoryStates().toMutableMap()
        states[state.recordType] = state.copy(updatedAt = System.currentTimeMillis())
        preferences.edit().putString(KEY_CATEGORIES, encodeCategories(states.values)).apply()
    }

    @Synchronized
    fun saveCategories(states: Collection<CategorySyncUiState>) {
        val existing = categoryStates().toMutableMap()
        states.forEach { state ->
            existing[state.recordType] = state.copy(updatedAt = System.currentTimeMillis())
        }
        preferences.edit().putString(KEY_CATEGORIES, encodeCategories(existing.values)).apply()
    }

    fun lastSuccessfulSyncAt(): Long? = preferences.getLong(KEY_LAST_SUCCESS, -1L).takeIf { it >= 0L }

    fun saveLastSuccessfulSyncAt(value: Long) {
        preferences.edit().putLong(KEY_LAST_SUCCESS, value).apply()
    }

    fun lastBackgroundSyncAt(): Long? = preferences.getLong(KEY_LAST_BACKGROUND, -1L).takeIf { it >= 0L }

    fun saveLastBackgroundSyncAt(value: Long) {
        preferences.edit().putLong(KEY_LAST_BACKGROUND, value).apply()
    }

    fun nextBackgroundSyncAt(): Long? = preferences.getLong(KEY_NEXT_BACKGROUND, -1L).takeIf { it >= 0L }

    fun saveNextBackgroundSyncAt(value: Long?) {
        val editor = preferences.edit()
        if (value == null) editor.remove(KEY_NEXT_BACKGROUND) else editor.putLong(KEY_NEXT_BACKGROUND, value)
        editor.apply()
    }

    @Synchronized
    fun clearCategoryStates() {
        preferences.edit().remove(KEY_CATEGORIES).apply()
    }

    @Synchronized
    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun encodeCategories(states: Collection<CategorySyncUiState>): String {
        val array = JSONArray()
        states.forEach { state ->
            array.put(
                JSONObject()
                    .put("recordType", state.recordType)
                    .put("status", state.status.name)
                    .put("discovered", state.discoveredRecords)
                    .put("uploaded", state.uploadedRecords)
                    .put("remaining", state.remainingRecords)
                    .put("hasMore", state.hasMore)
                    .put("message", state.message)
                    .put("updatedAt", state.updatedAt),
            )
        }
        return array.toString()
    }

    private fun decodeCategories(value: String?): List<CategorySyncUiState> {
        if (value.isNullOrBlank()) return emptyList()
        return runCatching {
            val array = JSONArray(value)
            buildList {
                repeat(array.length()) { index ->
                    val item = array.getJSONObject(index)
                    add(
                        CategorySyncUiState(
                            recordType = item.getString("recordType"),
                            status = CategorySyncStatus.valueOf(item.getString("status")),
                            discoveredRecords = item.optInt("discovered", 0),
                            uploadedRecords = item.optInt("uploaded", 0),
                            remainingRecords = item.optInt("remaining", 0),
                            hasMore = item.optBoolean("hasMore", false),
                            message = item.optString("message").takeIf { it.isNotBlank() && it != "null" },
                            updatedAt = item.optLong("updatedAt", -1L).takeIf { it >= 0L },
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    companion object {
        const val BACKGROUND_INTERVAL_MILLIS = 6L * 60L * 60L * 1000L
        private const val KEY_CATEGORIES = "categories"
        private const val KEY_LAST_SUCCESS = "lastSuccessfulSyncAt"
        private const val KEY_LAST_BACKGROUND = "lastBackgroundSyncAt"
        private const val KEY_NEXT_BACKGROUND = "nextBackgroundSyncAt"
    }
}
