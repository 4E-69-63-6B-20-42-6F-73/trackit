package net.trackit.companion

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.Record
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.text.NumberFormat
import kotlinx.coroutines.launch
import kotlin.reflect.KClass

@Composable
fun HistoricalUploadScreen(
    healthSync: HealthConnectSync,
    recordTypes: Set<KClass<out Record>>,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val workManager = remember { WorkManager.getInstance(context) }
    val workFlow = remember(workManager) {
        workManager.getWorkInfosForUniqueWorkFlow(
            HistoricalImportWorker.WORK_NAME,
        )
    }
    val workInfos by workFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val workInfo =
        workInfos.firstOrNull { !it.state.isFinished }
            ?: workInfos.lastOrNull()
    val running =
        workInfo?.state == WorkInfo.State.ENQUEUED ||
            workInfo?.state == WorkInfo.State.RUNNING ||
            workInfo?.state == WorkInfo.State.BLOCKED

    var selectedDays by remember { mutableStateOf(30) }
    var pendingDays by remember { mutableStateOf<Int?>(null) }
    var pendingTypes by remember { mutableStateOf<Set<KClass<out Record>>?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var showDetails by remember { mutableStateOf(true) }
    var showSetupAfterCompletion by remember { mutableStateOf(false) }
    var showSelectedCategories by remember { mutableStateOf(false) }
    var showCancelDialog by remember { mutableStateOf(false) }

    val progressJson =
        if (running) {
            workInfo?.progress?.getString(HistoricalImportWorker.PROGRESS_JSON)
        } else {
            workInfo?.outputData?.getString(HistoricalImportWorker.RESULT_PROGRESS_JSON)
                ?: workInfo?.progress?.getString(HistoricalImportWorker.PROGRESS_JSON)
        }

    val workerStates = remember(progressJson) {
        HistoricalProgressCodec.decode(progressJson)
    }

    val currentTypeNames = healthSync.supportedRecordTypes
        .filter { it in recordTypes }
        .map { it.simpleName.orEmpty() }

    val displayStates =
        if (workerStates.isNotEmpty()) {
            workerStates.sortedBy { it.categoryIndex }
        } else {
            currentTypeNames.mapIndexed { index, category ->
                HistoricalImportProgress(
                    category = category,
                    categoryIndex = index,
                    totalCategories = currentTypeNames.size,
                    phase = HistoricalImportPhase.PENDING,
                )
            }
        }

    val completedStates = displayStates.filter {
        it.phase == HistoricalImportPhase.COMPLETE
    }
    val failedStates = displayStates.filter {
        it.phase == HistoricalImportPhase.ERROR
    }
    val activeState = displayStates.firstOrNull {
        it.phase == HistoricalImportPhase.READING ||
            it.phase == HistoricalImportPhase.UPLOADING ||
            it.phase == HistoricalImportPhase.WAITING_TO_RETRY
    }
    val totalUploaded = displayStates.sumOf { it.uploadedRecords }
    val completedCount = completedStates.size + failedStates.size
    val numberFormat = remember { NumberFormat.getIntegerInstance() }

    fun runImport(
        days: Int,
        types: Set<KClass<out Record>>,
    ) {
        if (running || types.isEmpty()) return

        message = null
        showSetupAfterCompletion = false
        showDetails = true

        val data = Data.Builder()
            .putInt(HistoricalImportWorker.KEY_DAYS, days)
            .putStringArray(
                HistoricalImportWorker.KEY_RECORD_TYPES,
                types.mapNotNull { it.qualifiedName }.toTypedArray(),
            )
            .build()

        val request = OneTimeWorkRequestBuilder<HistoricalImportWorker>()
            .setInputData(data)
            .build()

        workManager.enqueueUniqueWork(
            HistoricalImportWorker.WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract(),
    ) {
        val days = pendingDays
        val types = pendingTypes
        pendingDays = null
        pendingTypes = null

        if (days != null && types != null) {
            scope.launch {
                val required = healthSync.permissionsFor(
                    recordTypes = types,
                    includeBackground = true,
                )

                if (healthSync.hasPermissions(required)) {
                    runImport(days, types)
                } else {
                    message =
                        "Historical upload needs the selected Health Connect permissions."
                }
            }
        }
    }

    fun requestOrRun(
        days: Int,
        types: Set<KClass<out Record>>,
    ) {
        scope.launch {
            val required = healthSync.permissionsFor(
                recordTypes = types,
                includeBackground = true,
            )

            if (healthSync.hasPermissions(required)) {
                runImport(days, types)
            } else {
                pendingDays = days
                pendingTypes = types
                permissionLauncher.launch(required)
            }
        }
    }

    LaunchedEffect(workInfo?.id, workInfo?.state) {
        if (workInfo?.state == WorkInfo.State.CANCELLED) {
            message = "Historical upload stopped. Records already uploaded remain in TrackIt."
        }
    }

    if (showCancelDialog) {
        AlertDialog(
            onDismissRequest = { showCancelDialog = false },
            title = { Text("Stop historical upload?") },
            text = {
                Text(
                    "Records already uploaded will remain in TrackIt. " +
                        "You can run the import again later.",
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCancelDialog = false
                        workManager.cancelUniqueWork(
                            HistoricalImportWorker.WORK_NAME,
                        )
                    },
                ) {
                    Text("Stop")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showCancelDialog = false },
                ) {
                    Text("Keep uploading")
                }
            },
        )
    }

    val terminalState = workInfo?.state
    val showSetup =
        !running &&
            (
                workInfo == null ||
                    showSetupAfterCompletion ||
                    terminalState == WorkInfo.State.CANCELLED
                )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            "Historical import",
            style = MaterialTheme.typography.headlineMedium,
        )

        message?.let {
            Text(it)
        }

        when {
            showSetup -> {
                SetupContent(
                    selectedDays = selectedDays,
                    onDaysSelected = { selectedDays = it },
                    selectedCategories = currentTypeNames,
                    showCategories = showSelectedCategories,
                    onToggleCategories = {
                        showSelectedCategories = !showSelectedCategories
                    },
                    onStart = {
                        requestOrRun(
                            selectedDays,
                            recordTypes,
                        )
                    },
                )
            }

            running -> {
                RunningContent(
                    active = activeState,
                    states = displayStates,
                    completedCount = completedCount,
                    totalUploaded = totalUploaded,
                    showDetails = showDetails,
                    onToggleDetails = { showDetails = !showDetails },
                    onStop = { showCancelDialog = true },
                    numberFormat = numberFormat,
                )
            }

            terminalState == WorkInfo.State.SUCCEEDED -> {
                CompletionContent(
                    states = displayStates,
                    totalUploaded = totalUploaded,
                    showDetails = showDetails,
                    onToggleDetails = { showDetails = !showDetails },
                    numberFormat = numberFormat,
                    onDone = onBack,
                    onUploadAnother = {
                        showSetupAfterCompletion = true
                    },
                    onRetryFailed = if (failedStates.isNotEmpty()) {
                        {
                            val failedNames = failedStates
                                .map { it.category }
                                .toSet()
                            val failedTypes = healthSync.supportedRecordTypes.filter {
                                it.simpleName in failedNames
                            }.toSet()
                            val days = workInfo?.outputData?.getInt(
                                HistoricalImportWorker.RESULT_DAYS,
                                selectedDays,
                            ) ?: selectedDays
                            requestOrRun(days, failedTypes)
                        }
                    } else {
                        null
                    },
                )
            }

            terminalState == WorkInfo.State.FAILED -> {
                FailedContent(
                    states = displayStates,
                    error = workInfo?.outputData?.getString(
                        HistoricalImportWorker.RESULT_ERROR,
                    ) ?: "Unknown error",
                    totalUploaded = totalUploaded,
                    showDetails = showDetails,
                    onToggleDetails = { showDetails = !showDetails },
                    numberFormat = numberFormat,
                    onTryAgain = {
                        showSetupAfterCompletion = true
                    },
                )
            }

            else -> {
                SetupContent(
                    selectedDays = selectedDays,
                    onDaysSelected = { selectedDays = it },
                    selectedCategories = currentTypeNames,
                    showCategories = showSelectedCategories,
                    onToggleCategories = {
                        showSelectedCategories = !showSelectedCategories
                    },
                    onStart = {
                        requestOrRun(
                            selectedDays,
                            recordTypes,
                        )
                    },
                )
            }
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
private fun SetupContent(
    selectedDays: Int,
    onDaysSelected: (Int) -> Unit,
    selectedCategories: List<String>,
    showCategories: Boolean,
    onToggleCategories: () -> Unit,
    onStart: () -> Unit,
) {
    Text(
        "Upload older Health Connect data to TrackIt. " +
            "Existing records won't be duplicated.",
    )

    Text(
        "History range",
        style = MaterialTheme.typography.titleMedium,
    )

    RangeOption(
        title = "Last 7 days",
        selected = selectedDays == 7,
        onClick = { onDaysSelected(7) },
    )

    RangeOption(
        title = "Last 30 days",
        selected = selectedDays == 30,
        onClick = { onDaysSelected(30) },
    )

    RangeOption(
        title = "All available history",
        subtitle = "May take a while for Heart Rate and other frequently recorded data.",
        selected = selectedDays == Int.MAX_VALUE,
        onClick = { onDaysSelected(Int.MAX_VALUE) },
    )

    Card(Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onToggleCategories),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "${selectedCategories.size} health categories selected",
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onToggleCategories) {
                    Icon(
                        if (showCategories) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                    )
                }
            }

            if (showCategories) {
                HorizontalDivider()
                selectedCategories.forEach { category ->
                    Text(category.removeSuffix("Record"))
                }
            }
        }
    }

    Button(
        onClick = onStart,
        enabled = selectedCategories.isNotEmpty(),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text(
            when (selectedDays) {
                7 -> "Upload 7 days"
                30 -> "Upload 30 days"
                else -> "Upload all available history"
            },
        )
    }
}

@Composable
private fun RangeOption(
    title: String,
    subtitle: String? = null,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RadioButton(
                selected = selected,
                onClick = onClick,
            )
            Column(
                modifier = Modifier.padding(start = 8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleSmall,
                )
                subtitle?.let {
                    Text(
                        it,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
    }
}

@Composable
private fun RunningContent(
    active: HistoricalImportProgress?,
    states: List<HistoricalImportProgress>,
    completedCount: Int,
    totalUploaded: Int,
    showDetails: Boolean,
    onToggleDetails: () -> Unit,
    onStop: () -> Unit,
    numberFormat: NumberFormat,
) {
    Text(
        "Uploading health history",
        style = MaterialTheme.typography.titleLarge,
    )

    active?.let { progress ->
        Text(
            progress.category.removeSuffix("Record"),
            style = MaterialTheme.typography.titleMedium,
        )

        Text(
            when (progress.phase) {
                HistoricalImportPhase.WAITING_TO_RETRY -> {
                    val seconds = progress.retryAfterSeconds
                    if (seconds != null) {
                        "${progress.issue ?: "Connection interrupted"}. Retrying in about $seconds seconds…"
                    } else {
                        "${progress.issue ?: "Connection interrupted"}. Retrying automatically…"
                    }
                }

                HistoricalImportPhase.READING ->
                    "${numberFormat.format(progress.discoveredRecords)} records found, " +
                        "${numberFormat.format(progress.uploadedRecords)} uploaded"

                HistoricalImportPhase.UPLOADING ->
                    "${numberFormat.format(progress.uploadedRecords)} records uploaded"

                else ->
                    "${numberFormat.format(progress.uploadedRecords)} records uploaded"
            },
        )
    }

    LinearProgressIndicator(
        modifier = Modifier.fillMaxWidth(),
    )

    Text(
        "$completedCount of ${states.size} categories processed",
    )
    Text(
        "${numberFormat.format(totalUploaded)} total records uploaded",
    )
    Text(
        "You can leave this screen. TrackIt will continue uploading in the background.",
        style = MaterialTheme.typography.bodySmall,
    )

    DetailsSection(
        states = states,
        showDetails = showDetails,
        onToggleDetails = onToggleDetails,
        numberFormat = numberFormat,
    )

    OutlinedButton(
        onClick = onStop,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Stop upload")
    }
}

@Composable
private fun CompletionContent(
    states: List<HistoricalImportProgress>,
    totalUploaded: Int,
    showDetails: Boolean,
    onToggleDetails: () -> Unit,
    numberFormat: NumberFormat,
    onDone: () -> Unit,
    onUploadAnother: () -> Unit,
    onRetryFailed: (() -> Unit)?,
) {
    val failed = states.count { it.phase == HistoricalImportPhase.ERROR }
    val complete = states.count { it.phase == HistoricalImportPhase.COMPLETE }

    Icon(
        if (failed == 0) Icons.Default.CheckCircle else Icons.Default.ErrorOutline,
        contentDescription = null,
    )

    Text(
        if (failed == 0) {
            "Historical upload complete"
        } else {
            "Upload completed with $failed problem${if (failed == 1) "" else "s"}"
        },
        style = MaterialTheme.typography.titleLarge,
    )

    Text("${numberFormat.format(totalUploaded)} records uploaded")
    Text("$complete of ${states.size} categories completed successfully")

    if (failed == 0) {
        Text("All available records in the selected range have been processed.")
    } else {
        onRetryFailed?.let {
            Button(
                onClick = it,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Retry failed categories")
            }
        }
    }

    DetailsSection(
        states = states,
        showDetails = showDetails,
        onToggleDetails = onToggleDetails,
        numberFormat = numberFormat,
        problemsFirst = failed > 0,
    )

    Button(
        onClick = onDone,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Done")
    }

    TextButton(
        onClick = onUploadAnother,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Upload another range")
    }
}

@Composable
private fun FailedContent(
    states: List<HistoricalImportProgress>,
    error: String,
    totalUploaded: Int,
    showDetails: Boolean,
    onToggleDetails: () -> Unit,
    numberFormat: NumberFormat,
    onTryAgain: () -> Unit,
) {
    Icon(
        Icons.Default.ErrorOutline,
        contentDescription = null,
    )

    Text(
        "Historical upload stopped",
        style = MaterialTheme.typography.titleLarge,
    )
    Text(error)
    Text("${numberFormat.format(totalUploaded)} records were uploaded before it stopped.")

    if (states.isNotEmpty()) {
        DetailsSection(
            states = states,
            showDetails = showDetails,
            onToggleDetails = onToggleDetails,
            numberFormat = numberFormat,
            problemsFirst = true,
        )
    }

    Button(
        onClick = onTryAgain,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Text("Try again")
    }
}

@Composable
private fun DetailsSection(
    states: List<HistoricalImportProgress>,
    showDetails: Boolean,
    onToggleDetails: () -> Unit,
    numberFormat: NumberFormat,
    problemsFirst: Boolean = false,
) {
    val ordered =
        if (problemsFirst) {
            states.sortedWith(
                compareBy<HistoricalImportProgress> {
                    if (it.phase == HistoricalImportPhase.ERROR) 0 else 1
                }.thenBy { it.categoryIndex },
            )
        } else {
            states.sortedBy { it.categoryIndex }
        }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggleDetails),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Details",
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.weight(1f),
        )
        TextButton(onClick = onToggleDetails) {
            Text(if (showDetails) "Hide" else "Show")
        }
    }

    if (showDetails) {
        Card(Modifier.fillMaxWidth()) {
            Column {
                ordered.forEachIndexed { index, progress ->
                    CategoryRow(
                        progress = progress,
                        numberFormat = numberFormat,
                    )
                    if (index != ordered.lastIndex) {
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}

@Composable
private fun CategoryRow(
    progress: HistoricalImportProgress,
    numberFormat: NumberFormat,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = when (progress.phase) {
                HistoricalImportPhase.COMPLETE -> Icons.Default.CheckCircle
                HistoricalImportPhase.ERROR -> Icons.Default.ErrorOutline
                HistoricalImportPhase.READING,
                HistoricalImportPhase.UPLOADING,
                HistoricalImportPhase.WAITING_TO_RETRY,
                -> Icons.Default.Sync

                HistoricalImportPhase.PENDING -> Icons.Default.Schedule
            },
            contentDescription = null,
        )

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = 12.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(progress.category.removeSuffix("Record"))

            when (progress.phase) {
                HistoricalImportPhase.ERROR -> {
                    Text(
                        progress.issue ?: "Problem",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }

                HistoricalImportPhase.WAITING_TO_RETRY -> {
                    Text(
                        "Waiting to retry",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }

                else -> Unit
            }
        }

        Spacer(Modifier.padding(2.dp))

        Text(
            when (progress.phase) {
                HistoricalImportPhase.PENDING -> "Waiting"
                HistoricalImportPhase.READING -> {
                    if (progress.uploadedRecords > 0) {
                        numberFormat.format(progress.uploadedRecords)
                    } else {
                        "Reading"
                    }
                }

                HistoricalImportPhase.UPLOADING,
                HistoricalImportPhase.WAITING_TO_RETRY,
                HistoricalImportPhase.COMPLETE,
                HistoricalImportPhase.ERROR,
                -> numberFormat.format(progress.uploadedRecords)
            },
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}
