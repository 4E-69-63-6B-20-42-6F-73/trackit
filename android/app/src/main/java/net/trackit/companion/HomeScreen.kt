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
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun HomeScreen(
    state: CompanionUiState,
    onPair: () -> Unit,
    onChooseCategories: () -> Unit,
    onSync: () -> Unit,
    onRetryFailed: () -> Unit,
    onRecoverPermissions: () -> Unit,
    onHistorical: () -> Unit,
    onViewLog: () -> Unit,
    onConnection: () -> Unit,
    onBackgroundChanged: (Boolean) -> Unit,
    onCancelSync: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("TrackIt Companion", style = MaterialTheme.typography.headlineMedium)
        Text(
            state.statusMessage,
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.testTag("status_message"),
        )

        ConnectionCard(
            state = state,
            onPair = onPair,
            onConnection = onConnection,
        )

        if (state.paired) {
            SyncSummaryCard(state)

            Card(Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Health Connect", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (state.healthAvailable) {
                            "${state.selectedTypes.size} categories selected"
                        } else {
                            "Health Connect is unavailable on this device"
                        },
                    )
                    OutlinedButton(
                        enabled = state.healthAvailable && !state.syncRunning,
                        onClick = onChooseCategories,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Choose categories")
                    }
                }
            }

            if (state.categories.isNotEmpty()) {
                Text("Category status", style = MaterialTheme.typography.titleMedium)
                state.categories.forEach { category ->
                    CategoryStatusCard(category)
                }
            }

            Card(Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("Background sync", style = MaterialTheme.typography.titleMedium)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                when {
                                    !state.backgroundReadAvailable && state.healthAvailable -> "Not supported by Health Connect on this device"
                                    state.backgroundSyncEnabled -> "Runs about every 6 hours when network and permissions are available"
                                    else -> "Optional; manual sync works without it"
                                },
                            )
                            state.nextBackgroundSyncAt?.let {
                                Text(
                                    "Next scheduled around ${formatTimestamp(it)}",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                        Switch(
                            checked = state.backgroundSyncEnabled,
                            enabled = state.backgroundReadAvailable && !state.syncRunning,
                            onCheckedChange = onBackgroundChanged,
                            modifier = Modifier.testTag("background_sync_switch"),
                        )
                    }
                }
            }

            Button(
                enabled = state.healthAvailable && state.selectedTypes.isNotEmpty() && !state.syncRunning,
                onClick = onSync,
                modifier = Modifier.fillMaxWidth().testTag("sync_now"),
            ) {
                Text(if (state.syncRunning) "Syncing…" else "Sync now")
            }

            if (state.failedTypes.isNotEmpty() && !state.syncRunning) {
                Button(
                    onClick = onRetryFailed,
                    modifier = Modifier.fillMaxWidth().testTag("retry_failed"),
                ) {
                    Text("Retry failed (${state.failedTypes.size})")
                }
            }

            if (state.permissionRequiredTypes.isNotEmpty() && !state.syncRunning) {
                Button(
                    onClick = onRecoverPermissions,
                    modifier = Modifier.fillMaxWidth().testTag("grant_access"),
                ) {
                    Text("Grant Health Connect access (${state.permissionRequiredTypes.size})")
                }
            }

            if (state.syncRunning) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                OutlinedButton(
                    onClick = onCancelSync,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Cancel sync")
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(
                    enabled = state.healthAvailable && state.selectedTypes.isNotEmpty() && !state.syncRunning,
                    onClick = onHistorical,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("History")
                }
                OutlinedButton(
                    onClick = onViewLog,
                    modifier = Modifier.weight(1f),
                ) {
                    Text("Sync log")
                }
            }
        }
    }
}

@Composable
private fun ConnectionCard(
    state: CompanionUiState,
    onPair: () -> Unit,
    onConnection: () -> Unit,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text("Connection", style = MaterialTheme.typography.titleMedium)
            if (state.paired) {
                Text(state.serverUrl ?: "Paired TrackIt server")
                state.deviceId?.let {
                    Text("Device ${it.take(8)}…", style = MaterialTheme.typography.bodySmall)
                }
                OutlinedButton(
                    onClick = onConnection,
                    modifier = Modifier.fillMaxWidth().testTag("connection_details"),
                ) {
                    Text("Connection details")
                }
            } else {
                Text("Pair this phone with your TrackIt server before selecting data or syncing.")
                Button(
                    onClick = onPair,
                    modifier = Modifier.fillMaxWidth().testTag("pair_device"),
                ) {
                    Text("Pair device")
                }
            }
        }
    }
}

@Composable
private fun SyncSummaryCard(state: CompanionUiState) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("Sync status", style = MaterialTheme.typography.titleMedium)
            Text(
                state.lastSuccessfulSyncAt?.let { "Last successful sync: ${formatTimestamp(it)}" }
                    ?: "No successful sync yet",
            )
            state.lastBackgroundSyncAt?.let {
                Text(
                    "Last background run: ${formatTimestamp(it)}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun CategoryStatusCard(category: CategorySyncUiState) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("category_${category.recordType}"),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(recordTypeLabel(category.recordType), style = MaterialTheme.typography.titleSmall)
                Text(category.status.label(), style = MaterialTheme.typography.labelMedium)
            }
            if (category.discoveredRecords > 0 || category.uploadedRecords > 0) {
                Text(
                    buildString {
                        append("${category.discoveredRecords} read · ${category.uploadedRecords} uploaded")
                        if (category.remainingRecords > 0) append(" · ${category.remainingRecords} remaining")
                        if (category.hasMore) append(" · more pending")
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            category.message?.let {
                Text(it, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun CategorySyncStatus.label(): String = when (this) {
    CategorySyncStatus.IDLE -> "Ready"
    CategorySyncStatus.WAITING -> "Waiting"
    CategorySyncStatus.READING -> "Reading"
    CategorySyncStatus.UPLOADING -> "Uploading"
    CategorySyncStatus.RETRYING -> "Retrying"
    CategorySyncStatus.COMPLETE -> "Synced"
    CategorySyncStatus.ERROR -> "Error"
    CategorySyncStatus.PERMISSION_REQUIRED -> "Permission needed"
    CategorySyncStatus.CANCELLED -> "Cancelled"
}

private val homeTimeFormatter = DateTimeFormatter.ofPattern("MMM d, HH:mm")
    .withZone(ZoneId.systemDefault())

private fun formatTimestamp(timestamp: Long): String =
    homeTimeFormatter.format(Instant.ofEpochMilli(timestamp))
