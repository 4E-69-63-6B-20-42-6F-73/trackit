package net.trackit.companion

import kotlinx.coroutines.CancellationException

object CategorySyncRunner {
    suspend fun <T> run(
        categories: Set<T>,
        cancelled: () -> Boolean,
        sync: suspend (T) -> Unit,
        onResult: suspend (category: T, outcome: CategorySyncOutcome, completed: Int, total: Int) -> Unit,
    ): Map<T, CategorySyncOutcome> {
        val results = linkedMapOf<T, CategorySyncOutcome>()
        for ((index, category) in categories.withIndex()) {
            if (cancelled()) throw CancellationException("Sync cancelled")
            val outcome = try {
                sync(category)
                CategorySyncOutcome(CategorySyncResult.COMPLETE)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                CategorySyncOutcome(
                    CategorySyncResult.PERMISSION_REVOKED,
                    e.message ?: "Health Connect access was revoked",
                )
            } catch (e: Exception) {
                CategorySyncOutcome(
                    CategorySyncResult.ERROR,
                    e.message ?: "Unknown sync error",
                )
            }
            results[category] = outcome
            onResult(category, outcome, index + 1, categories.size)
        }
        return results
    }
}
