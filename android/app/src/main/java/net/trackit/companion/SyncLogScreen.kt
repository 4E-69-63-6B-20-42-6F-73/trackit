package net.trackit.companion

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun SyncLogScreen(
    store: SyncLogStore,
    onBack: () -> Unit,
) {
    var entries by remember { mutableStateOf(store.entries()) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Sync log", style = MaterialTheme.typography.headlineMedium)
        Text("Recent sync activity, retries, permission problems, and server errors are kept on this device.")

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onBack) {
                Text("Back")
            }
            OutlinedButton(onClick = { entries = store.entries() }) {
                Text("Refresh")
            }
            Button(
                enabled = entries.isNotEmpty(),
                onClick = {
                    store.clear()
                    entries = emptyList()
                },
            ) {
                Text("Clear")
            }
        }

        if (entries.isEmpty()) {
            Text("No sync events yet.")
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(entries) { entry ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            "${entry.level.label()} • ${formatTimestamp(entry.timestamp)}",
                            style = MaterialTheme.typography.labelMedium,
                        )
                        Text(entry.message, style = MaterialTheme.typography.bodyMedium)
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

private fun SyncLogLevel.label(): String = when (this) {
    SyncLogLevel.INFO -> "Info"
    SyncLogLevel.WARNING -> "Warning"
    SyncLogLevel.ERROR -> "Error"
}

private val syncLogTimeFormatter = DateTimeFormatter.ofPattern("MMM d, HH:mm:ss")
    .withZone(ZoneId.systemDefault())

private fun formatTimestamp(timestamp: Long): String =
    syncLogTimeFormatter.format(Instant.ofEpochMilli(timestamp))
