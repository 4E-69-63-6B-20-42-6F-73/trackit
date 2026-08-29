package net.trackit.companion

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.net.URI
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject

private data class PairingDetails(
    val serverUrl: String,
    val serverIdentity: String,
    val code: String,
)

private data class PairingAttempt(
    val details: PairingDetails,
    val returnToManual: Boolean,
)

private sealed class PairingDialogState {
    object Idle : PairingDialogState()
    object Scanning : PairingDialogState()
    object Manual : PairingDialogState()
    data class Review(val details: PairingDetails) : PairingDialogState()
    object Requesting : PairingDialogState()
    data class Waiting(val deviceId: String) : PairingDialogState()
    data class Success(val deviceId: String) : PairingDialogState()
    data class Error(val message: String, val attempt: PairingAttempt? = null) : PairingDialogState()
}

@Composable
fun PairingDialog(
    activity: Activity,
    onDismiss: () -> Unit,
    onPaired: () -> Unit,
) {
    var state by remember { mutableStateOf<PairingDialogState>(PairingDialogState.Idle) }
    var manualServerUrl by remember { mutableStateOf("") }
    var manualServerIdentity by remember { mutableStateOf("") }
    var manualCode by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val credentialStore = remember(activity) { CredentialStore(activity) }
    val pairingClient = remember(activity) { PairingClient(activity) }
    val pairingPoller = remember { PairingPoller() }
    val scanner = remember(activity) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(activity, options)
    }

    fun finishPairing(
        result: PairingResult.Success,
        attempt: PairingAttempt,
    ) {
        if (result.serverIdentity != attempt.details.serverIdentity) {
            state = PairingDialogState.Error(
                "Server identity changed during pairing. Verify the server and try again.",
                attempt,
            )
            return
        }
        val saved = runCatching {
            credentialStore.save(
                attempt.details.serverUrl,
                result.deviceId,
                result.credential,
                result.serverIdentity,
                result.keyFingerprint,
            )
        }
        if (saved.isFailure) {
            state = PairingDialogState.Error(
                "Pairing succeeded, but the credential could not be stored securely.",
                attempt,
            )
            return
        }
        state = PairingDialogState.Success(result.deviceId)
        onPaired()
    }

    fun submit(details: PairingDetails, returnToManual: Boolean) {
        val normalized = normalizePairingDetails(details)
        val attempt = PairingAttempt(normalized ?: details, returnToManual)
        if (normalized == null) {
            state = PairingDialogState.Error(
                "Enter a valid HTTPS server URL, server identity, and pairing code.",
                attempt,
            )
            return
        }
        scope.launch {
            state = PairingDialogState.Requesting
            val result = try {
                pairingClient.pair(
                    normalized.serverUrl,
                    normalized.serverIdentity,
                    normalized.code,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                PairingResult.Failure(e.message ?: "Network error", null)
            }
            when (result) {
                is PairingResult.Success -> finishPairing(result, attempt)
                is PairingResult.Pending -> {
                    if (result.deviceId.isBlank()) {
                        state = PairingDialogState.Error(
                            "The server accepted the request but did not return a device ID.",
                            attempt,
                        )
                        return@launch
                    }
                    if (result.serverIdentity.isNotBlank() && result.serverIdentity != normalized.serverIdentity) {
                        state = PairingDialogState.Error(
                            "Server identity mismatch. Verify the server and try again.",
                            attempt,
                        )
                        return@launch
                    }
                    state = PairingDialogState.Waiting(result.deviceId)
                    val polled = pairingPoller.pollForConfirmation(
                        deviceId = result.deviceId,
                        serverUrl = normalized.serverUrl,
                        credential = result.credential,
                        keyFingerprint = result.keyFingerprint,
                        serverIdentity = result.serverIdentity,
                    )
                    when (polled) {
                        is PairingResult.Success -> finishPairing(polled, attempt)
                        is PairingResult.Pending -> state = PairingDialogState.Error(
                            "Pairing timed out before it was confirmed.",
                            attempt,
                        )
                        is PairingResult.Failure -> state = PairingDialogState.Error(
                            polled.message,
                            attempt,
                        )
                    }
                }
                is PairingResult.Failure -> state = PairingDialogState.Error(
                    result.message,
                    attempt,
                )
            }
        }
    }

    fun scan() {
        state = PairingDialogState.Scanning
        scanner.startScan()
            .addOnSuccessListener { barcode ->
                runCatching {
                    parsePairingDetails(barcode.rawValue ?: error("QR code has no content"))
                }.onSuccess {
                    state = PairingDialogState.Review(it)
                }.onFailure {
                    state = PairingDialogState.Error(it.message ?: "Could not read pairing QR code")
                }
            }
            .addOnCanceledListener {
                state = PairingDialogState.Idle
            }
            .addOnFailureListener {
                state = PairingDialogState.Error("QR scanning failed: ${it.message ?: "unknown error"}")
            }
    }

    val busy = state is PairingDialogState.Requesting || state is PairingDialogState.Waiting

    Dialog(
        onDismissRequest = {
            if (!busy) {
                onDismiss()
            }
        },
        properties = DialogProperties(
            dismissOnBackPress = !busy,
            dismissOnClickOutside = false,
        ),
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                when (val current = state) {
                    PairingDialogState.Idle -> IdleView(
                        onScan = ::scan,
                        onManual = { state = PairingDialogState.Manual },
                        onDismiss = onDismiss,
                    )
                    PairingDialogState.Scanning -> ProgressView(
                        title = "Opening scanner",
                        message = "Scan the pairing QR code shown in TrackIt.",
                    )
                    PairingDialogState.Manual -> ManualEntryView(
                        serverUrl = manualServerUrl,
                        serverIdentity = manualServerIdentity,
                        code = manualCode,
                        onServerUrlChanged = { manualServerUrl = it },
                        onServerIdentityChanged = { manualServerIdentity = it },
                        onCodeChanged = { manualCode = it },
                        onConfirm = {
                            submit(
                                PairingDetails(
                                    serverUrl = manualServerUrl,
                                    serverIdentity = manualServerIdentity,
                                    code = manualCode,
                                ),
                                returnToManual = true,
                            )
                        },
                        onBack = { state = PairingDialogState.Idle },
                    )
                    is PairingDialogState.Review -> ReviewView(
                        details = current.details,
                        onConfirm = { submit(current.details, returnToManual = false) },
                        onBack = { state = PairingDialogState.Idle },
                    )
                    PairingDialogState.Requesting -> ProgressView(
                        title = "Requesting pairing",
                        message = "Contacting the TrackIt server…",
                    )
                    is PairingDialogState.Waiting -> ProgressView(
                        title = "Waiting for confirmation",
                        message = "Approve device ${current.deviceId} in TrackIt. This screen will update automatically.",
                    )
                    is PairingDialogState.Success -> SuccessView(
                        deviceId = current.deviceId,
                        onDismiss = onDismiss,
                    )
                    is PairingDialogState.Error -> ErrorView(
                        message = current.message,
                        onBack = {
                            state = when {
                                current.attempt == null -> PairingDialogState.Idle
                                current.attempt.returnToManual -> PairingDialogState.Manual
                                else -> PairingDialogState.Review(current.attempt.details)
                            }
                        },
                        onDismiss = onDismiss,
                    )
                }
            }
        }
    }
}

@Composable
private fun IdleView(
    onScan: () -> Unit,
    onManual: () -> Unit,
    onDismiss: () -> Unit,
) {
    Icon(
        imageVector = Icons.Default.QrCode,
        contentDescription = null,
        modifier = Modifier.size(64.dp),
        tint = MaterialTheme.colorScheme.primary,
    )
    Text("Pair Device", style = MaterialTheme.typography.headlineSmall)
    Text(
        "Scan the pairing QR code from TrackIt or enter the details manually.",
        textAlign = TextAlign.Center,
    )
    Button(onClick = onScan, modifier = Modifier.fillMaxWidth()) {
        Text("Scan QR Code")
    }
    TextButton(onClick = onManual, modifier = Modifier.fillMaxWidth()) {
        Text("Enter Details Manually")
    }
    TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
        Text("Close")
    }
}

@Composable
private fun ManualEntryView(
    serverUrl: String,
    serverIdentity: String,
    code: String,
    onServerUrlChanged: (String) -> Unit,
    onServerIdentityChanged: (String) -> Unit,
    onCodeChanged: (String) -> Unit,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
) {
    Text("Enter Pairing Details", style = MaterialTheme.typography.titleLarge)
    OutlinedTextField(
        value = serverUrl,
        onValueChange = onServerUrlChanged,
        label = { Text("HTTPS server URL") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    OutlinedTextField(
        value = serverIdentity,
        onValueChange = onServerIdentityChanged,
        label = { Text("Server identity") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    OutlinedTextField(
        value = code,
        onValueChange = onCodeChanged,
        label = { Text("Pairing code") },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = onBack, modifier = Modifier.weight(1f)) {
            Text("Back")
        }
        Button(
            onClick = onConfirm,
            modifier = Modifier.weight(1f),
            enabled = serverUrl.isNotBlank() && serverIdentity.isNotBlank() && code.isNotBlank(),
        ) {
            Text("Request Pairing")
        }
    }
}

@Composable
private fun ReviewView(
    details: PairingDetails,
    onConfirm: () -> Unit,
    onBack: () -> Unit,
) {
    Icon(
        imageVector = Icons.Default.CheckCircle,
        contentDescription = null,
        modifier = Modifier.size(48.dp),
        tint = MaterialTheme.colorScheme.primary,
    )
    Text("Verify Pairing", style = MaterialTheme.typography.titleLarge)
    Text(
        "Confirm these values match TrackIt before sending the request.",
        textAlign = TextAlign.Center,
    )
    OutlinedTextField(
        value = details.serverUrl,
        onValueChange = {},
        label = { Text("Server URL") },
        enabled = false,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = details.serverIdentity,
        onValueChange = {},
        label = { Text("Server identity") },
        enabled = false,
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = details.code,
        onValueChange = {},
        label = { Text("Pairing code") },
        enabled = false,
        modifier = Modifier.fillMaxWidth(),
    )
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = onBack, modifier = Modifier.weight(1f)) {
            Text("Back")
        }
        Button(onClick = onConfirm, modifier = Modifier.weight(1f)) {
            Text("Request Pairing")
        }
    }
}

@Composable
private fun ProgressView(
    title: String,
    message: String,
) {
    CircularProgressIndicator(modifier = Modifier.size(48.dp))
    Text(title, style = MaterialTheme.typography.titleLarge)
    Text(message, textAlign = TextAlign.Center)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun ErrorView(
    message: String,
    onBack: () -> Unit,
    onDismiss: () -> Unit,
) {
    Icon(
        imageVector = Icons.Default.Error,
        contentDescription = null,
        modifier = Modifier.size(48.dp),
        tint = MaterialTheme.colorScheme.error,
    )
    Text(
        "Pairing Failed",
        style = MaterialTheme.typography.titleLarge,
        color = MaterialTheme.colorScheme.error,
    )
    Text(message, textAlign = TextAlign.Center)
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        TextButton(onClick = onDismiss, modifier = Modifier.weight(1f)) {
            Text("Close")
        }
        Button(onClick = onBack, modifier = Modifier.weight(1f)) {
            Text("Back")
        }
    }
}

@Composable
private fun SuccessView(
    deviceId: String,
    onDismiss: () -> Unit,
) {
    Icon(
        imageVector = Icons.Default.CheckCircle,
        contentDescription = null,
        modifier = Modifier.size(64.dp),
        tint = MaterialTheme.colorScheme.primary,
    )
    Text("Pairing Successful", style = MaterialTheme.typography.headlineSmall)
    Text("Device $deviceId is paired and ready to sync.", textAlign = TextAlign.Center)
    Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
        Text("Continue")
    }
}

private fun parsePairingDetails(raw: String): PairingDetails {
    val payload = JSONObject(raw)
    val expiresAt = Instant.parse(payload.getString("expiresAt"))
    require(expiresAt.isAfter(Instant.now())) {
        "Pairing code has expired. Generate a new code in TrackIt."
    }
    return PairingDetails(
        serverUrl = payload.getString("serverUrl"),
        serverIdentity = payload.getString("serverIdentity"),
        code = payload.getString("code"),
    )
}

private fun normalizePairingDetails(details: PairingDetails): PairingDetails? {
    val serverUrl = details.serverUrl.trim().trimEnd('/')
    val serverIdentity = details.serverIdentity.trim()
    val code = details.code.trim()
    if (serverIdentity.isBlank() || code.isBlank()) return null
    val uri = runCatching { URI(serverUrl) }.getOrNull() ?: return null
    if (!uri.scheme.equals("https", ignoreCase = true) || uri.host.isNullOrBlank()) return null
    return PairingDetails(serverUrl, serverIdentity, code)
}
