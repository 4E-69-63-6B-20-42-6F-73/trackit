package net.trackit.companion

import kotlinx.coroutines.CancellationException

object CategorySyncRunner {
    suspend fun <T> run(
        categories: Set<T>,
        cancelled: () -> Boolean,
        sync: suspend (T) -> Unit,
        onResult: suspend (category: T, result: String, completed: Int, total: Int) -> Unit,
    ): Map<T, String> {
        val results = linkedMapOf<T, String>()
        categories.forEachIndexed { index, category ->
            if (cancelled()) return@forEachIndexed
            val result = try {
                sync(category)
                "complete"
            } catch (_: CancellationException) {
                "cancelled"
            } catch (_: SecurityException) {
                "permission_revoked"
            } catch (_: Exception) {
                "error"
            }
            results[category] = result
            onResult(category, result, index + 1, categories.size)
        }
        return results
    }
}
