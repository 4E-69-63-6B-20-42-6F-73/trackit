package net.trackit.companion

object SyncRecoveryPolicy {
    const val RECENT_REREAD_DAYS = 30L

    fun needsRecentReread(
        savedCursor: String?,
        changesTokenExpired: Boolean,
    ): Boolean = savedCursor == null || changesTokenExpired
}

enum class BackgroundSyncDisposition {
    SUCCESS,
    RETRY,
}

object BackgroundSyncPolicy {
    fun disposition(outcomes: Collection<CategorySyncOutcome>): BackgroundSyncDisposition =
        if (outcomes.any { it.result == CategorySyncResult.ERROR }) {
            BackgroundSyncDisposition.RETRY
        } else {
            BackgroundSyncDisposition.SUCCESS
        }
}
