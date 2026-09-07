package net.trackit.companion

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

@Composable
fun ConnectionScreen(
    state: CompanionUiState,
    onBack: () -> Unit,
    onPairDifferent: () -> Unit,
    onUnpair: () -> Unit,
    onReset: () -> Unit,
) {
    var confirmUnpair by remember { mutableStateOf(false) }
    var confirmReset by remember { mutableStateOf(false) }

    if (confirmUnpair) {
        AlertDialog(
            onDismissRequest = { confirmUnpair = false },
            title = { Text("Unpair this device?") },
            text = { Text("TrackIt credentials and sync cursors will be removed from this phone. Your health data on the server is not deleted.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmUnpair = false
                        onUnpair()
                    },
                ) {
                    Text("Unpair")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmUnpair = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text("Reset companion app?") },
            text = { Text("This clears pairing credentials, local sync state, selected categories, background sync settings, sync logs, and device keys from this phone.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmReset = false
                        onReset()
                    },
                ) {
                    Text("Reset")
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmReset = false }) {
                    Text("Cancel")
                }
            },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Connection", style = MaterialTheme.typography.headlineMedium)

        Card(Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                DetailRow("Server", state.serverUrl ?: "Not paired")
                DetailRow("Device ID", state.deviceId ?: "—")
                DetailRow("Server identity", state.serverIdentity ?: "—")
                DetailRow(
                    "Background sync",
                    if (state.backgroundSyncEnabled) "Enabled" else "Disabled",
                )
            }
        }

        Button(
            onClick = onPairDifferent,
            modifier = Modifier.fillMaxWidth().testTag("pair_different_server"),
        ) {
            Text("Pair with a different server")
        }

        OutlinedButton(
            enabled = state.paired,
            onClick = { confirmUnpair = true },
            modifier = Modifier.fillMaxWidth().testTag("unpair_device"),
        ) {
            Text("Unpair this device")
        }

        OutlinedButton(
            onClick = { confirmReset = true },
            modifier = Modifier.fillMaxWidth().testTag("reset_companion"),
        ) {
            Text("Reset companion app")
        }

        OutlinedButton(
            onClick = onBack,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Back")
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value)
    }
}
