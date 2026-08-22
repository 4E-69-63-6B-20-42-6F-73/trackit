package net.trackit.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private var resumeSignal by mutableIntStateOf(0)

    override fun onResume() {
        super.onResume()
        resumeSignal++
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) {
                    val credentialStore = remember { CredentialStore(this@MainActivity) }
                    var paired by remember {
                        mutableStateOf(
                            runCatching {
                                credentialStore.read("deviceId") != null &&
                                    credentialStore.read("serverUrl") != null &&
                                    credentialStore.read("credential") != null
                            }.getOrDefault(false),
                        )
                    }
                    var status by remember {
                        mutableStateOf(if (paired) "Paired. Ready to sync." else "Not paired")
                    }
                    var cancelSync by remember { mutableStateOf(false) }
                    var backgroundSync by remember {
                        mutableStateOf(credentialStore.backgroundSyncEnabled())
                    }
                    var syncProgress by remember { mutableFloatStateOf(0f) }
                    var syncRunning by remember { mutableStateOf(false) }
                    var showPairingDialog by remember { mutableStateOf(false) }
                    var selectedTypes by remember {
                        mutableStateOf(credentialStore.selectedRecordTypes())
                    }
                    val scope = rememberCoroutineScope()
                    val healthSync = remember { HealthConnectSync(this@MainActivity) }
                    val healthAvailable = healthSync.availability() == HealthConnectClient.SDK_AVAILABLE
                    val backgroundReadAvailable = healthAvailable && healthSync.supportsBackgroundRead()
                    val selectedClasses = healthSync.supportedRecordTypes
                        .filter { it.simpleName in selectedTypes }
                        .toSet()
                    val basePermissions = healthSync.permissionsFor(selectedClasses)

                    fun startSync() {
                        if (syncRunning || selectedClasses.isEmpty()) return
                        syncRunning = true
                        cancelSync = false
                        syncProgress = 0f
                        status = "Syncing selected categories…"
                        scope.launch {
                            try {
                                val results = healthSync.syncSelected(
                                    selectedClasses,
                                    cancelled = { cancelSync },
                                    onProgress = { completed, total, recordType ->
                                        syncProgress = if (total == 0) 0f else completed.toFloat() / total
                                        status = "Imported $completed of $total: ${recordType.removeSuffix("Record")}" 
                                    },
                                )
                                val paused = results.values.count { it == "permission_revoked" }
                                val failed = results.values.count { it == "error" }
                                val backgroundGranted = backgroundSync &&
                                    backgroundReadAvailable &&
                                    healthSync.hasBackgroundReadPermission()
                                status = when {
                                    cancelSync -> "Import cancelled safely"
                                    failed > 0 -> "Sync finished; $failed categories need a retry. Other categories were saved."
                                    paused > 0 -> "Sync finished; $paused categories are paused until access is granted."
                                    backgroundSync && !backgroundReadAvailable -> "Sync complete. Background reads are not supported on this device."
                                    backgroundSync && !backgroundGranted -> "Sync complete. Background access was not granted."
                                    else -> "Sync complete"
                                }
                            } catch (_: CancellationException) {
                                status = "Import cancelled safely"
                            } catch (e: Exception) {
                                status = "Sync failed: ${e.message ?: "Unknown error"}"
                            } finally {
                                syncRunning = false
                            }
                        }
                    }

                    fun applyBackgroundScheduling(granted: Set<String>) {
                        val canRunInBackground = backgroundSync &&
                            backgroundReadAvailable &&
                            healthSync.permissionsFor(selectedClasses, includeBackground = true)
                                .all { it in granted }
                        if (canRunInBackground) {
                            BackgroundSyncWorker.schedule(this@MainActivity)
                        } else {
                            BackgroundSyncWorker.cancel(this@MainActivity)
                        }
                    }

                    val permissionLauncher = rememberLauncherForActivityResult(
                        PermissionController.createRequestPermissionResultContract(),
                    ) {
                        scope.launch {
                            val granted = healthSync.grantedPermissions()
                            applyBackgroundScheduling(granted)
                            if (granted.containsAll(basePermissions)) {
                                startSync()
                            } else {
                                status = "Some selected Health Connect categories were not granted."
                            }
                        }
                    }

                    fun requestOrStartSync() {
                        if (!paired || !healthAvailable || selectedClasses.isEmpty() || syncRunning) return
                        credentialStore.saveSelectedRecordTypes(selectedTypes)
                        credentialStore.saveBackgroundSyncEnabled(backgroundSync)
                        scope.launch {
                            val requested = healthSync.permissionsFor(
                                selectedClasses,
                                includeBackground = backgroundSync && backgroundReadAvailable,
                            )
                            val granted = healthSync.grantedPermissions()
                            if (granted.containsAll(requested)) {
                                applyBackgroundScheduling(granted)
                                startSync()
                            } else {
                                permissionLauncher.launch(requested)
                            }
                        }
                    }

                    LaunchedEffect(resumeSignal, paired, healthAvailable) {
                        if (resumeSignal == 0) return@LaunchedEffect
                        if (!paired || !healthAvailable || selectedClasses.isEmpty() || syncRunning) return@LaunchedEffect
                        val granted = healthSync.grantedPermissions()
                        if (granted.containsAll(basePermissions)) {
                            applyBackgroundScheduling(granted)
                            startSync()
                        }
                    }

                    Box(Modifier.fillMaxSize()) {
                        Column(
                            Modifier
                                .fillMaxSize()
                                .verticalScroll(rememberScrollState())
                                .padding(start = 24.dp, top = 24.dp, end = 24.dp, bottom = 96.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Text("TrackIt Companion", style = MaterialTheme.typography.headlineMedium)
                            Text(status)
                            Text(
                                if (paired) {
                                    "Use the + button to pair with a different TrackIt server."
                                } else {
                                    "Use the + button to pair this device with TrackIt."
                                },
                            )
                            Text("Choose what to import", style = MaterialTheme.typography.titleMedium)
                            Text(
                                if (healthAvailable) {
                                    "Health Connect is available. Access is requested only for selected categories."
                                } else {
                                    "Health Connect is not available on this device. Pairing remains available."
                                },
                            )
                            healthSync.supportedRecordTypes.forEach { recordType ->
                                val name = recordType.simpleName.orEmpty()
                                FilterChip(
                                    selected = name in selectedTypes,
                                    onClick = {
                                        selectedTypes = if (name in selectedTypes) {
                                            selectedTypes - name
                                        } else {
                                            selectedTypes + name
                                        }
                                        credentialStore.saveSelectedRecordTypes(selectedTypes)
                                    },
                                    label = { Text(name.removeSuffix("Record")) },
                                )
                            }
                            Text(
                                when {
                                    !backgroundReadAvailable && healthAvailable -> "Background Health Connect reads are not supported on this device."
                                    backgroundSync -> "Background sync is enabled and will run when access is granted."
                                    else -> "Background access is optional. Foreground sync works without it."
                                },
                            )
                            Switch(
                                checked = backgroundSync,
                                enabled = backgroundReadAvailable,
                                onCheckedChange = { enabled ->
                                    backgroundSync = enabled
                                    credentialStore.saveBackgroundSyncEnabled(enabled)
                                    if (!enabled) {
                                        BackgroundSyncWorker.cancel(this@MainActivity)
                                    }
                                },
                            )
                            Button(
                                enabled = paired && healthAvailable && selectedClasses.isNotEmpty() && !syncRunning,
                                onClick = { requestOrStartSync() },
                            ) {
                                Text(if (syncRunning) "Syncing…" else "Sync now")
                            }
                            if (!paired) {
                                Text("Pair this device before starting a Health Connect sync.")
                            }
                            if (syncRunning) {
                                LinearProgressIndicator(progress = { syncProgress })
                                Button(onClick = { cancelSync = true }) {
                                    Text("Cancel import")
                                }
                            }
                        }

                        FloatingActionButton(
                            onClick = { showPairingDialog = true },
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(16.dp),
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "Pair device")
                        }
                    }

                    if (showPairingDialog) {
                        PairingDialog(
                            activity = this@MainActivity,
                            onDismiss = { showPairingDialog = false },
                            onPaired = {
                                paired = true
                                status = "Paired successfully. Ready to sync."
                            },
                        )
                    }
                }
            }
        }
    }
}
