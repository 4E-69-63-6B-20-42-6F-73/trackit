package net.trackit.companion

class CategorySyncReporter(
    private val reportSyncing: suspend () -> Unit,
    private val reportComplete: suspend () -> Unit,
) {
    private var started = false

    suspend fun recordsFound() {
        if (!started) {
            reportSyncing()
            started = true
        }
    }

    suspend fun finish() {
        if (started) reportComplete()
    }
}
