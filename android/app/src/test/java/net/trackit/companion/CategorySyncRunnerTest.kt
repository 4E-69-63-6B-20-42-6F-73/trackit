package net.trackit.companion

import kotlinx.coroutines.CancellationException
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

        assertEquals(listOf("steps", "weight"), completed)
        assertEquals(CategorySyncResult.COMPLETE, results.getValue("steps").result)
        assertEquals(CategorySyncResult.ERROR, results.getValue("sleep").result)
        assertEquals("temporary failure", results.getValue("sleep").message)
        assertEquals(CategorySyncResult.COMPLETE, results.getValue("weight").result)
        assertEquals(
            listOf("steps:COMPLETE", "sleep:ERROR", "weight:COMPLETE"),
            reported,
        )
    }

    @Test
    fun `coroutine cancellation is propagated and later categories are not run`() = runBlocking {
        val started = mutableListOf<String>()
        var cancelled = false

        try {
            CategorySyncRunner.run(
                categories = linkedSetOf("steps", "sleep", "weight"),
                cancelled = { false },
                sync = { category ->
                    started += category
                    if (category == "sleep") throw CancellationException("stop")
                },
                onResult = { _, _, _, _ -> },
            )
        } catch (_: CancellationException) {
            cancelled = true
        }

        assertTrue(cancelled)
        assertEquals(listOf("steps", "sleep"), started)
    }
}
