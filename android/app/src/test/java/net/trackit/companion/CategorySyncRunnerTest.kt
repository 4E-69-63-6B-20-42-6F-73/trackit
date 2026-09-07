package net.trackit.companion

import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CategorySyncRunnerTest {
    @Test
    fun `one failed category does not stop successful categories`() = runBlocking {
        val completed = mutableListOf<String>()
        val reported = mutableListOf<String>()

        val results = CategorySyncRunner.run(
            categories = linkedSetOf("steps", "sleep", "weight"),
            cancelled = { false },
            sync = { category ->
                if (category == "sleep") error("temporary failure")
                completed += category
            },
            onResult = { category, outcome, _, _ -> reported += "$category:${outcome.result}" },
        )

        assertEquals(setOf("steps", "weight"), completed.toSet())
        assertEquals(CategorySyncResult.COMPLETE, results.getValue("steps").result)
        assertEquals(CategorySyncResult.ERROR, results.getValue("sleep").result)
        assertEquals("temporary failure", results.getValue("sleep").message)
        assertEquals(CategorySyncResult.COMPLETE, results.getValue("weight").result)
        assertEquals(
            setOf("steps:COMPLETE", "sleep:ERROR", "weight:COMPLETE"),
            reported.toSet(),
        )
    }

    @Test
    fun `category concurrency is bounded`() = runBlocking {
        val running = AtomicInteger(0)
        val peak = AtomicInteger(0)

        CategorySyncRunner.run(
            categories = (1..8).toSet(),
            cancelled = { false },
            maxConcurrency = 2,
            sync = {
                val active = running.incrementAndGet()
                peak.updateAndGet { current -> maxOf(current, active) }
                delay(20)
                running.decrementAndGet()
            },
            onResult = { _, _, _, _ -> },
        )

        assertEquals(2, peak.get())
    }

    @Test
    fun `coroutine cancellation is propagated`() = runBlocking {
        var cancelled = false

        try {
            CategorySyncRunner.run(
                categories = linkedSetOf("steps", "sleep", "weight"),
                cancelled = { false },
                maxConcurrency = 1,
                sync = { category ->
                    if (category == "sleep") throw CancellationException("stop")
                },
                onResult = { _, _, _, _ -> },
            )
        } catch (_: CancellationException) {
            cancelled = true
        }

        assertTrue(cancelled)
    }
}
