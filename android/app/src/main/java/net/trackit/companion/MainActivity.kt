package net.trackit.companion

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

private enum class CompanionScreen {
    HOME,
    CATEGORIES,
    HISTORICAL,
    SYNC_LOG,
    CONNECTION,
}

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
                    val companionViewModel: CompanionViewModel = viewModel()
                    val state by companionViewModel.uiState.collectAsStateWithLifecycle()
                    val healthSync = remember { HealthConnectSync(this@MainActivity) }
                    val syncLog = remember { SyncLogStore(this@MainActivity) }
                    var screen by remember { mutableStateOf(CompanionScreen.HOME) }
                    var showPairingDialog by remember { mutableStateOf(false) }
                    var firstSyncAfterPairing by remember { mutableStateOf(false) }

                    val selectedClasses = healthSync.supportedRecordTypes
                        .filter { it.simpleName in state.selectedTypes }
                        .toSet()

                    val permissionLauncher = rememberLauncherForActivityResult(
                        PermissionController.createRequestPermissionResultContract(),
                    ) {
                        companionViewModel.onPermissionResult()
                    }

                    LaunchedEffect(state.permissionRequest) {
                        state.permissionRequest?.let { permissions ->
                            permissionLauncher.launch(permissions)
                        }
                    }

                    LaunchedEffect(resumeSignal) {
                        if (resumeSignal > 0) companionViewModel.refresh()
                    }

                    BackHandler(enabled = screen != CompanionScreen.HOME) {
                        screen = CompanionScreen.HOME
                    }

                    when (screen) {
                        CompanionScreen.HOME -> HomeScreen(
                            state = state,
                            onPair = { showPairingDialog = true },
                            onChooseCategories = { screen = CompanionScreen.CATEGORIES },
                            onSync = { companionViewModel.requestSync() },
                            onRetryFailed = companionViewModel::retryFailed,
                            onRecoverPermissions = companionViewModel::recoverPermissions,
                            onHistorical = { screen = CompanionScreen.HISTORICAL },
                            onViewLog = { screen = CompanionScreen.SYNC_LOG },
                            onConnection = { screen = CompanionScreen.CONNECTION },
                            onBackgroundChanged = companionViewModel::setBackgroundSyncEnabled,
                            onCancelSync = companionViewModel::cancelSync,
                        )

                        CompanionScreen.CATEGORIES -> CategorySelectionScreen(
                            categories = companionViewModel.supportedTypeNames,
                            selected = state.selectedTypes,
                            onSave = { selection ->
                                companionViewModel.saveCategories(
                                    selection,
                                    startFirstSync = firstSyncAfterPairing,
                                )
                                firstSyncAfterPairing = false
                                screen = CompanionScreen.HOME
                            },
                            onBack = {
                                firstSyncAfterPairing = false
                                screen = CompanionScreen.HOME
                            },
                        )

                        CompanionScreen.HISTORICAL -> HistoricalUploadScreen(
                            healthSync = healthSync,
                            recordTypes = selectedClasses,
                            onBack = { screen = CompanionScreen.HOME },
                        )

                        CompanionScreen.SYNC_LOG -> SyncLogScreen(
                            store = syncLog,
                            onBack = { screen = CompanionScreen.HOME },
                        )

                        CompanionScreen.CONNECTION -> ConnectionScreen(
                            state = state,
                            onBack = { screen = CompanionScreen.HOME },
                            onPairDifferent = { showPairingDialog = true },
                            onUnpair = {
                                companionViewModel.unpair()
                                screen = CompanionScreen.HOME
                            },
                            onReset = {
                                companionViewModel.resetCompanion()
                                screen = CompanionScreen.HOME
                            },
                        )
                    }

                    if (showPairingDialog) {
                        PairingDialog(
                            activity = this@MainActivity,
                            onDismiss = { showPairingDialog = false },
                            onPaired = {
                                firstSyncAfterPairing = true
                                companionViewModel.onPaired()
                                screen = CompanionScreen.CATEGORIES
                            },
                        )
                    }
                }
            }
        }
    }
}
