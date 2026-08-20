package net.trackit.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.HealthConnectClient
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import kotlinx.coroutines.launch
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize()) {
                    var serverUrl by remember { mutableStateOf("") }
                    var serverIdentity by remember { mutableStateOf("") }
                    var code by remember { mutableStateOf("") }
                    var status by remember { mutableStateOf("Not paired") }
                    var cancelSync by remember { mutableStateOf(false) }
                    var backgroundSync by remember { mutableStateOf(false) }
                    var syncProgress by remember { mutableFloatStateOf(0f) }
                    val credentialStore = remember { CredentialStore(this@MainActivity) }
                    var selectedTypes by remember {
                        mutableStateOf(credentialStore.selectedRecordTypes())
                    }
                    val scope = rememberCoroutineScope()
                    val scanner = remember {
                        val options = GmsBarcodeScannerOptions.Builder()
                            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                            .enableAutoZoom()
                            .build()
                        GmsBarcodeScanning.getClient(this@MainActivity, options)
                    }
                    val healthSync = remember { HealthConnectSync(this@MainActivity) }
                    val healthAvailable = healthSync.availability() == HealthConnectClient.SDK_AVAILABLE
                    val selectedClasses = healthSync.supportedRecordTypes
                        .filter { it.simpleName in selectedTypes }
                        .toSet()
                    val permissionLauncher = rememberLauncherForActivityResult(
                        PermissionController.createRequestPermissionResultContract(),
                    ) { granted ->
                        val required = healthSync.permissionsFor(selectedClasses) +
                            if (backgroundSync && android.os.Build.VERSION.SDK_INT >= 34) {
                                setOf("android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND")
                            } else {
                                emptySet()
                            }
                        if (granted.containsAll(required)) {
                            if (backgroundSync) {
                                BackgroundSyncWorker.schedule(this@MainActivity)
                            }
                            scope.launch {
                                cancelSync = false
                                syncProgress = 0f
                                status = "Syncing selected categoriesâ€¦"
                                val results = healthSync.syncSelected(
                                    selectedClasses,
                                    cancelled = { cancelSync },
                                    onProgress = { completed, total, recordType ->
                                        syncProgress = completed.toFloat() / total
                                        status = "Imported $completed of $total: ${recordType.removeSuffix("Record")}"
                                    },
                                )
                                val paused = results.values.count { it == "permission_revoked" }
                                val failed = results.values.count { it == "error" }
                                status = when {
                                    cancelSync -> "Import cancelled safely"
                                    failed > 0 -> "Sync finished; $failed categories need a retry. Other categories were saved."
                                    paused > 0 -> "Sync finished; $paused categories are paused until access is granted."
                                    else -> "Sync complete"
                                }
                            }
                        } else {
                            status = "Some categories were not granted; they remain paused."
                        }
                    }
                    Column(
                        Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("Pair TrackIt", style = MaterialTheme.typography.headlineMedium)
                        Text("Confirm the server address and identity shown in TrackIt before pairing.")
                        Button(
                            onClick = {
                                scanner.startScan()
                                    .addOnSuccessListener { barcode ->
                                        runCatching {
                                            val payload = JSONObject(
                                                barcode.rawValue ?: error("QR code has no content"),
                                            )
                                            val expiresAt = java.time.Instant.parse(
                                                payload.getString("expiresAt"),
                                            )
                                            require(expiresAt.isAfter(java.time.Instant.now())) {
                                                "Pairing code has expired"
                                            }
                                            serverUrl = payload.getString("serverUrl")
                                            serverIdentity = payload.getString("serverIdentity")
                                            code = payload.getString("code")
                                            status = "QR read. Verify the server identity, then request pairing."
                                        }.onFailure {
                                            status = "That is not a valid TrackIt pairing QR code."
                                        }
                                    }
                                    .addOnFailureListener {
                                        status = "QR scanning was unavailable. You can enter the details manually."
                                    }
                            },
                        ) {
                            Text("Scan pairing QR code")
                        }
                        OutlinedTextField(serverUrl, { serverUrl = it }, label = { Text("HTTPS server URL") })
                        OutlinedTextField(serverIdentity, { serverIdentity = it }, label = { Text("Server identity") })
                        OutlinedTextField(code, { code = it }, label = { Text("Pairing code") })
                        Button(onClick = {
                            scope.launch {
                                status = runCatching {
                                    PairingClient(this@MainActivity).pair(serverUrl, serverIdentity, code)
                                    "Waiting for confirmation in TrackIt"
                                }.getOrElse { "Pairing failed: ${it.message}" }
                            }
                        }) { Text("Request pairing") }
                        Text(status)
                        if (status.startsWith("Syncing") || status.startsWith("Imported")) {
                            LinearProgressIndicator(progress = { syncProgress })
                        }
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
                                },
                                label = { Text(name.removeSuffix("Record")) },
                            )
                        }
                        Text("Background access is optional. Foreground sync works without it.")
                        Switch(checked = backgroundSync, onCheckedChange = { backgroundSync = it })
                        Button(
                            enabled = healthAvailable && selectedClasses.isNotEmpty(),
                            onClick = {
                                credentialStore.saveSelectedRecordTypes(selectedTypes)
                                val requested = healthSync.permissionsFor(selectedClasses) +
                                    if (backgroundSync && android.os.Build.VERSION.SDK_INT >= 34) {
                                        setOf("android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND")
                                    } else {
                                        emptySet()
                                    }
                                permissionLauncher.launch(requested)
                            },
                        ) { Text("Review Health Connect access") }
                        if (status.startsWith("Syncing")) {
                            Button(onClick = { cancelSync = true }) { Text("Cancel import") }
                        }
                    }
                }
            }
        }
    }
}
