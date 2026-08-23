package net.trackit.companion

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.Record
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlin.reflect.KClass

@Composable
fun HistoricalUploadScreen(
    healthSync: HealthConnectSync,
    recordTypes: Set<KClass<out Record>>,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val states = remember { mutableStateMapOf<String, HistoricalImportProgress>() }
    var running by remember { mutableStateOf(false) }
    var cancelled by remember { mutableStateOf(false) }
    var selectedDays by remember { mutableStateOf(30) }
    var summary by remember { mutableStateOf("Choose a time range to start.") }
    var pendingDays by remember { mutableStateOf<Int?>(null) }

    fun runImport(days: Int) {
        if (running || recordTypes.isEmpty()) return
        running = true
        cancelled = false
        states.clear()
        summary = "Preparing historical upload…"
        scope.launch {
            try {
                val result = healthSync.importHistorical(
                    recordTypes = recordTypes,
                    days = days,
                    cancelled = { cancelled },
                    onProgress = { progress -> states[progress.category] = progress },
                )
                summary = if (result.issues.isEmpty()) {
                    "Upload complete: ${result.uploadedRecords} records uploaded."
                } else {
                    "Upload finished with ${result.issues.size} issue(s). ${result.uploadedRecords} records uploaded."
                }
            } catch (_: CancellationException) {
                summary = "Historical upload cancelled safely."
            } catch (e: Exception) {
                summary = "Historical upload failed: ${e.message ?: "Unknown error"}"
            } finally {
                running = false
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) {
        val days = pendingDays
        pendingDays = null
        if (days != null) {
            scope.launch {
                val required = healthSync.permissionsFor(recordTypes)
                if (healthSync.hasPermissions(required)) {
                    runImport(days)
                } else {
                    summary = "Historical upload cannot start until the selected Health Connect access is granted."
                }
            }
        }
    }

    fun requestOrRun(days: Int) {
        selectedDays = days
        scope.launch {
            val required = healthSync.permissionsFor(recordTypes)
            if (healthSync.hasPermissions(required)) {
                runImport(days)
            } else {
                pendingDays = days
                permissionLauncher.launch(required)
            }
        }
    }

    val orderedStates = healthSync.supportedRecordTypes.mapNotNull { type ->
        states[type.simpleName.orEmpty()]
    }
    val active = orderedStates.lastOrNull { it.phase == HistoricalImportPhase.READING || it.phase == HistoricalImportPhase.UPLOADING }
    val completed = orderedStates.count { it.phase == HistoricalImportPhase.COMPLETE || it.phase == HistoricalImportPhase.ERROR }
    val total = recordTypes.size
    val fractional = active?.let {
        if (it.phase == HistoricalImportPhase.UPLOADING && it.discoveredRecords > 0) {
            it.uploadedRecords.toFloat() / it.discoveredRecords
        } else {
            0f
        }
    } ?: 0f
    val overallProgress = if (total == 0) 0f else ((completed + fractional) / total).coerceIn(0f, 1f)

    BackHandler(enabled = !running, onBack = onBack)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Historical upload", style = MaterialTheme.typography.headlineMedium)
        Text(summary)

        if (recordTypes.isEmpty()) {
            Text("No Health Connect categories are selected. Go back and select at least one category.")
        } else {
            Text("Time range", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { selectedDays = 7 }, enabled = !running) { Text("7 days") }
                OutlinedButton(onClick = { selectedDays = 30 }, enabled = !running) { Text("30 days") }
                OutlinedButton(onClick = { selectedDays = Int.MAX_VALUE }, enabled = !running) { Text("All") }
            }
            Button(
                onClick = { requestOrRun(selectedDays) },
                enabled = !running,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (running) "Uploading…" else "Start historical upload")
            }
        }

        if (running || states.isNotEmpty()) {
            LinearProgressIndicator(progress = { overallProgress }, modifier = Modifier.fillMaxWidth())
            Text("$completed of $total categories finished")
        }

        orderedStates.forEach { progress ->
            HistoricalCategoryCard(progress)
        }

        if (running) {
            OutlinedButton(
                onClick = { cancelled = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Cancel upload")
            }
        }

        OutlinedButton(
            onClick = onBack,
            enabled = !running,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Back")
        }
    }
}

@Composable
private fun HistoricalCategoryCard(progress: HistoricalImportProgress) {
    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(progress.category.removeSuffix("Record"), style = MaterialTheme.typography.titleMedium)
            Text(
                when (progress.phase) {
                    HistoricalImportPhase.READING -> "Reading records from Health Connect…"
                    HistoricalImportPhase.UPLOADING -> "Uploaded ${progress.uploadedRecords} of ${progress.discoveredRecords} records"
                    HistoricalImportPhase.COMPLETE -> "Complete: ${progress.uploadedRecords} records uploaded"
                    HistoricalImportPhase.ERROR -> "Issue: ${progress.issue ?: "Unknown error"}"
                },
            )
            if (progress.phase == HistoricalImportPhase.UPLOADING && progress.discoveredRecords > 0) {
                LinearProgressIndicator(
                    progress = { progress.uploadedRecords.toFloat() / progress.discoveredRecords },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
