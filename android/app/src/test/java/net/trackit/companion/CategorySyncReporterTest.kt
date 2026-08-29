package net.trackit.companion

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class CategorySyncReporterTest {
    @Test
    fun `empty categories make no server status requests`() = runBlocking {
        val calls = mutableListOf<String>()
        val reporter = CategorySyncReporter(
            reportSyncing = { calls += "syncing" },
            reportComplete = { calls += "complete" },
        )

        reporter.finish()

        assertEquals(emptyList<String>(), calls)
    }

    @Test
    fun `non-empty categories report one lifecycle regardless of batch count`() = runBlocking {
        val calls = mutableListOf<String>()
        val reporter = CategorySyncReporter(
            reportSyncing = { calls += "syncing" },
            reportComplete = { calls += "complete" },
        )

        reporter.recordsFound()
        reporter.recordsFound()
        reporter.finish()

        assertEquals(listOf("syncing", "complete"), calls)
    }
}
