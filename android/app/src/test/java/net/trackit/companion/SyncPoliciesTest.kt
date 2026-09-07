package net.trackit.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncPoliciesTest {
    @Test
    fun `missing or expired cursor requires recent reread`() {
        assertTrue(SyncRecoveryPolicy.needsRecentReread(null, false))
        assertTrue(SyncRecoveryPolicy.needsRecentReread("cursor", true))
        assertFalse(SyncRecoveryPolicy.needsRecentReread("cursor", false))
        assertEquals(30L, SyncRecoveryPolicy.RECENT_REREAD_DAYS)
    }

    @Test
    fun `background sync retries only category errors`() {
        assertEquals(
            BackgroundSyncDisposition.SUCCESS,
            BackgroundSyncPolicy.disposition(
                listOf(
                    CategorySyncOutcome(CategorySyncResult.COMPLETE),
                    CategorySyncOutcome(CategorySyncResult.PERMISSION_REVOKED),
                ),
            ),
        )
        assertEquals(
            BackgroundSyncDisposition.RETRY,
            BackgroundSyncPolicy.disposition(
                listOf(
                    CategorySyncOutcome(CategorySyncResult.COMPLETE),
                    CategorySyncOutcome(CategorySyncResult.ERROR, "server unavailable"),
                ),
            ),
        )
    }
}
