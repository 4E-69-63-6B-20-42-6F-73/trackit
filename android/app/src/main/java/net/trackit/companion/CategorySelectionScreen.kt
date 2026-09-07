package net.trackit.companion

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun CategorySelectionScreen(
    categories: List<String>,
    selected: Set<String>,
    onSave: (Set<String>) -> Unit,
    onBack: () -> Unit,
) {
    var draft by remember(selected) { mutableStateOf(selected) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Health Connect categories", style = MaterialTheme.typography.headlineMedium)
        Text("Choose only the data you want TrackIt to read. Android will request access for these categories when you sync.")

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = { draft = categories.toSet() }) {
                Text("Select all")
            }
            OutlinedButton(onClick = { draft = emptySet() }) {
                Text("Clear")
            }
        }

        categories.forEach { category ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Checkbox(
                    checked = category in draft,
                    onCheckedChange = { checked ->
                        draft = if (checked) draft + category else draft - category
                    },
                )
                Text(categoryLabel(category), style = MaterialTheme.typography.bodyLarge)
            }
        }

        Text("${draft.size} of ${categories.size} selected")

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onBack) {
                Text("Cancel")
            }
            Button(onClick = { onSave(draft) }) {
                Text("Save categories")
            }
        }
    }
}

private fun categoryLabel(value: String): String = value
    .removeSuffix("Record")
    .replace(Regex("([a-z0-9])([A-Z])")) { match ->
        "${match.groupValues[1]} ${match.groupValues[2]}"
    }
