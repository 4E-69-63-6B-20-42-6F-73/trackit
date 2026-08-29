package net.trackit.companion

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class CategorySyncRunnerTest {
    @Test
    fun `one failed category does not roll back or stop successful categories`() = runBlocking {
        val completed = mutableListOf<String>()
        val reported = mutableListOf<String>()

        val results = CategorySyncRunner.run(
            categories = linkedSetOf("steps", "sleep", "weight"),
            cancelled = { false },
            sync = { category ->
                if (category == "sleep") error("temporary failure")
                completed += category
            },
            onResult = { category, result, _, _ -> reported += "$category:$result" },
        )

        assertEquals(listOf("steps", "weight"), completed)
        assertEquals(
            mapOf("steps" to "complete", "sleep" to "error", "weight" to "complete"),
            results,
        )
        assertEquals(
            listOf("steps:complete", "sleep:error", "weight:complete"),
            reported,
        )
    }

    @Test
    fun `permanent and authentication failures are not reported as transient`() = runBlocking {
        val results = CategorySyncRunner.run(
            categories = linkedSetOf("auth", "invalid", "network"),
            cancelled = { false },
            sync = { category ->
                when (category) {
                    "auth" -> throw DeviceAuthenticationException("revoked", Exception())
                    "invalid" -> throw PermanentSyncException("invalid", Exception())
                    else -> error("offline")
                }
            },
            onResult = { _, _, _, _ -> },
        )

        assertEquals(
            mapOf(
                "auth" to "authentication_failed",
                "invalid" to "permanent_error",
                "network" to "error",
            ),
            results,
        )
    }
}
