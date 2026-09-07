package net.trackit.companion

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class CategorySelectionScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun selectionCanBeChangedAndSaved() {
        var saved: Set<String>? = null
        composeRule.setContent {
            MaterialTheme {
                CategorySelectionScreen(
                    categories = listOf("StepsRecord", "SleepSessionRecord", "WeightRecord"),
                    selected = setOf("StepsRecord"),
                    onSave = { saved = it },
                    onBack = {},
                )
            }
        }

        composeRule.onNodeWithTag("category_checkbox_SleepSessionRecord").performClick()
        composeRule.onNodeWithTag("category_selection_count").assertTextEquals("2 of 3 selected")
        composeRule.onNodeWithTag("save_categories").performClick()

        composeRule.runOnIdle {
            assertEquals(setOf("StepsRecord", "SleepSessionRecord"), saved)
        }
    }

    @Test
    fun selectAllAndClearUpdateDraftWithoutSavingImmediately() {
        var saved: Set<String>? = null
        composeRule.setContent {
            MaterialTheme {
                CategorySelectionScreen(
                    categories = listOf("StepsRecord", "WeightRecord"),
                    selected = setOf("StepsRecord"),
                    onSave = { saved = it },
                    onBack = {},
                )
            }
        }

        composeRule.onNodeWithTag("select_all_categories").performClick()
        composeRule.onNodeWithTag("category_selection_count").assertTextEquals("2 of 2 selected")
        composeRule.onNodeWithTag("clear_categories").performClick()
        composeRule.onNodeWithTag("category_selection_count").assertTextEquals("0 of 2 selected")

        composeRule.runOnIdle {
            assertEquals(null, saved)
        }
    }
}
