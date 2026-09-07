package net.trackit.companion

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit

object CategorySyncRunner {
    private const val DEFAULT_MAX_CONCURRENCY = 3

    suspend fun <T> run(
        categories: Set<T>,
        cancelled: () -> Boolean,
        sync: suspend (T) -> Unit,
        onResult: suspend (category: T, outcome: CategorySyncOutcome, completed: Int, total: Int) -> Unit,
        maxConcurrency: Int = DEFAULT_MAX_CONCURRENCY,
    ): Map<T, CategorySyncOutcome> = coroutineScope {
        require(maxConcurrency > 0)
        val orderedCategories = categories.toList()
        val semaphore = Semaphore(maxConcurrency)
        val resultMutex = Mutex()
        var completed = 0

        orderedCategories.map { category ->
            async {
                if (cancelled()) throw CancellationException("Sync cancelled")
                val outcome = semaphore.withPermit {
                    if (cancelled()) throw CancellationException("Sync cancelled")
                    try {
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
                }
                resultMutex.withLock {
                    completed += 1
                    onResult(category, outcome, completed, orderedCategories.size)
                }
                category to outcome
            }
        }.awaitAll().toMap(linkedMapOf())
    }
}
