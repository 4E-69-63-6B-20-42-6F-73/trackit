package net.trackit.companion

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertExists
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class HomeScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun failedAndPermissionCategoriesExposeRecoveryActions() {
        var retried = false
        var permissionRecovery = false
        val state = CompanionUiState(
            paired = true,
            healthAvailable = true,
            backgroundReadAvailable = true,
            selectedTypes = setOf("StepsRecord", "SleepSessionRecord"),
            categories = listOf(
                CategorySyncUiState("StepsRecord", status = CategorySyncStatus.ERROR),
                CategorySyncUiState("SleepSessionRecord", status = CategorySyncStatus.PERMISSION_REQUIRED),
            ),
            statusMessage = "Some categories need attention",
        )

        composeRule.setContent {
            MaterialTheme {
                HomeScreen(
                    state = state,
                    onPair = {},
                    onChooseCategories = {},
                    onSync = {},
                    onRetryFailed = { retried = true },
                    onRecoverPermissions = { permissionRecovery = true },
                    onHistorical = {},
                    onViewLog = {},
                    onConnection = {},
                    onBackgroundChanged = {},
                    onCancelSync = {},
                )
            }
        }

        composeRule.onNodeWithTag("retry_failed").assertExists().performClick()
        composeRule.onNodeWithTag("grant_access").assertExists().performClick()

        composeRule.runOnIdle {
            assertTrue(retried)
            assertTrue(permissionRecovery)
        }
    }

    @Test
    fun unpairedStateShowsPairAction() {
        var pairRequested = false
        composeRule.setContent {
            MaterialTheme {
                HomeScreen(
                    state = CompanionUiState(),
                    onPair = { pairRequested = true },
                    onChooseCategories = {},
                    onSync = {},
                    onRetryFailed = {},
                    onRecoverPermissions = {},
                    onHistorical = {},
                    onViewLog = {},
                    onConnection = {},
                    onBackgroundChanged = {},
                    onCancelSync = {},
                )
            }
        }

        composeRule.onNodeWithTag("pair_device").performClick()
        composeRule.runOnIdle { assertTrue(pairRequested) }
    }
}
