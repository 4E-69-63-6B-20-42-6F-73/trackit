package net.trackit.companion

import android.app.Application
import androidx.health.connect.client.HealthConnectClient
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CompanionViewModel(application: Application) : AndroidViewModel(application) {
    private sealed interface PendingPermissionAction {
        data class Sync(val recordTypes: Set<String>) : PendingPermissionAction
        data object EnableBackground : PendingPermissionAction
    }

    private val context = application.applicationContext
    private val credentials = CredentialStore(context)
    private val syncState = SyncStateStore(context)
    private val syncLog = SyncLogStore(context)
    private val healthSync = HealthConnectSync(context)
    private val _uiState = MutableStateFlow(CompanionUiState())
    private var pendingPermissionAction: PendingPermissionAction? = null
    private var syncJob: Job? = null

    val uiState: StateFlow<CompanionUiState> = _uiState.asStateFlow()
    val supportedTypeNames: List<String>
        get() = healthSync.supportedRecordTypes.mapNotNull { it.simpleName }

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val paired = credentials.isPaired()
            val healthAvailable = healthSync.availability() == HealthConnectClient.SDK_AVAILABLE
            val backgroundAvailable = healthAvailable && runCatching {
                healthSync.supportsBackgroundRead()
            }.getOrDefault(false)
            val selected = credentials.selectedRecordTypes()
            val persisted = syncState.categoryStates()
            val granted = if (healthAvailable) {
                runCatching { healthSync.grantedPermissions() }.getOrDefault(emptySet())
            } else {
                emptySet()
            }
            val categories = selected.map { recordType ->
                val previous = persisted[recordType] ?: CategorySyncUiState(recordType)
                val type = healthSync.supportedRecordTypes.firstOrNull { it.simpleName == recordType }
                val permissionMissing = type != null && healthAvailable &&
                    healthSync.permissionsFor(setOf(type)).any { it !in granted }
                if (
                    permissionMissing &&
                    previous.status !in setOf(
                        CategorySyncStatus.WAITING,
                        CategorySyncStatus.READING,
                        CategorySyncStatus.UPLOADING,
                        CategorySyncStatus.RETRYING,
                    )
                ) {
                    previous.copy(
                        status = CategorySyncStatus.PERMISSION_REQUIRED,
                        message = "Health Connect access is required",
                    )
                } else {
                    previous
                }
            }.sortedBy {
                supportedTypeNames.indexOf(it.recordType).takeIf { index -> index >= 0 }
                    ?: Int.MAX_VALUE
            }
            val lastSuccessfulSyncAt = syncState.lastSuccessfulSyncAt()

            _uiState.update { current ->
                current.copy(
                    paired = paired,
                    serverUrl = credentials.read("serverUrl"),
                    deviceId = credentials.read("deviceId"),
                    serverIdentity = credentials.read("fingerprint"),
                    healthAvailable = healthAvailable,
                    backgroundReadAvailable = backgroundAvailable,
                    selectedTypes = selected,
                    backgroundSyncEnabled = credentials.backgroundSyncEnabled(),
                    categories = categories,
                    lastSuccessfulSyncAt = lastSuccessfulSyncAt,
                    lastBackgroundSyncAt = syncState.lastBackgroundSyncAt(),
                    nextBackgroundSyncAt = syncState.nextBackgroundSyncAt(),
                    statusMessage = when {
                        current.syncRunning -> current.statusMessage
                        !paired -> "Pair this device to start syncing"
                        !healthAvailable -> "Health Connect is unavailable"
                        categories.any { it.status == CategorySyncStatus.ERROR } -> "Some categories need a retry"
                        categories.any { it.status == CategorySyncStatus.PERMISSION_REQUIRED } -> "Health Connect access needs attention"
                        lastSuccessfulSyncAt != null -> "Ready to sync"
                        else -> "Paired and ready for first sync"
                    },
                )
            }
        }
    }

    fun onPaired() {
        _uiState.update {
            it.copy(
                paired = credentials.isPaired(),
                serverUrl = credentials.read("serverUrl"),
                deviceId = credentials.read("deviceId"),
                serverIdentity = credentials.read("fingerprint"),
                statusMessage = "Paired. Choose the Health Connect categories to sync",
            )
        }
        syncLog.record(
            SyncLogLevel.INFO,
            SyncEventType.PAIRING,
            "Device paired successfully",
        )
        refresh()
    }

    fun saveCategories(selection: Set<String>, startFirstSync: Boolean = false) {
        credentials.saveSelectedRecordTypes(selection)
        val existing = syncState.categoryStates()
        selection.forEach { recordType ->
            if (existing[recordType] == null) {
                syncState.saveCategory(CategorySyncUiState(recordType))
            }
        }
        _uiState.update { it.copy(selectedTypes = selection) }
        refresh()
        if (startFirstSync && selection.isNotEmpty()) {
            requestSync(selection)
        }
    }

    fun requestSync(recordTypes: Set<String> = _uiState.value.selectedTypes) {
        if (_uiState.value.syncRunning || recordTypes.isEmpty()) return
        if (!credentials.isPaired()) {
            _uiState.update { it.copy(paired = false, statusMessage = "Pair this device before syncing") }
            return
        }
        if (!_uiState.value.healthAvailable) {
            _uiState.update { it.copy(statusMessage = "Health Connect is unavailable") }
            return
        }

        viewModelScope.launch {
            val classes = classesFor(recordTypes)
            if (classes.isEmpty()) return@launch
            val required = healthSync.permissionsFor(classes)
            val granted = healthSync.grantedPermissions()
            if (!granted.containsAll(required)) {
                pendingPermissionAction = PendingPermissionAction.Sync(recordTypes)
                _uiState.update {
                    it.copy(
                        permissionRequest = required,
                        statusMessage = "Grant Health Connect access to continue",
                    )
                }
                syncLog.record(
                    SyncLogLevel.WARNING,
                    SyncEventType.PERMISSION,
                    "Health Connect permission requested for ${recordTypes.size} categories",
                )
                return@launch
            }
            startSync(recordTypes)
        }
    }

    fun retryFailed() {
        val failed = _uiState.value.failedTypes
        if (failed.isNotEmpty()) requestSync(failed)
    }

    fun recoverPermissions() {
        val affected = _uiState.value.permissionRequiredTypes
        if (affected.isNotEmpty()) requestSync(affected)
    }

    fun setBackgroundSyncEnabled(enabled: Boolean) {
        if (!enabled) {
            credentials.saveBackgroundSyncEnabled(false)
            BackgroundSyncWorker.cancel(context)
            _uiState.update {
                it.copy(
                    backgroundSyncEnabled = false,
                    nextBackgroundSyncAt = null,
                    statusMessage = "Background sync disabled",
                )
            }
            return
        }

        if (!_uiState.value.backgroundReadAvailable) {
            _uiState.update { it.copy(statusMessage = "Background Health Connect reads are unsupported") }
            return
        }

        viewModelScope.launch {
            val classes = classesFor(_uiState.value.selectedTypes)
            if (classes.isEmpty()) {
                _uiState.update { it.copy(statusMessage = "Choose categories before enabling background sync") }
                return@launch
            }
            val required = healthSync.permissionsFor(classes, includeBackground = true)
            val granted = healthSync.grantedPermissions()
            if (!granted.containsAll(required)) {
                pendingPermissionAction = PendingPermissionAction.EnableBackground
                _uiState.update {
                    it.copy(
                        permissionRequest = required,
                        statusMessage = "Grant background Health Connect access",
                    )
                }
                return@launch
            }
            enableBackgroundSync()
        }
    }

    fun onPermissionResult() {
        val action = pendingPermissionAction
        pendingPermissionAction = null
        _uiState.update { it.copy(permissionRequest = null) }
        viewModelScope.launch {
            val granted = runCatching { healthSync.grantedPermissions() }.getOrDefault(emptySet())
            when (action) {
                is PendingPermissionAction.Sync -> {
                    val classes = classesFor(action.recordTypes)
                    val required = healthSync.permissionsFor(classes)
                    if (granted.containsAll(required)) {
                        startSync(action.recordTypes)
                    } else {
                        markPermissionRequired(action.recordTypes)
                        _uiState.update { it.copy(statusMessage = "Some Health Connect access was not granted") }
                    }
                }

                PendingPermissionAction.EnableBackground -> {
                    val classes = classesFor(_uiState.value.selectedTypes)
                    val required = healthSync.permissionsFor(classes, includeBackground = true)
                    if (granted.containsAll(required)) {
                        enableBackgroundSync()
                    } else {
                        credentials.saveBackgroundSyncEnabled(false)
                        _uiState.update {
                            it.copy(
                                backgroundSyncEnabled = false,
                                statusMessage = "Background sync needs Health Connect background access",
                            )
                        }
                    }
                }

                null -> refresh()
            }
        }
    }

    fun cancelSync() {
        if (syncJob?.isActive != true) return
        syncJob?.cancel(CancellationException("Sync cancelled by user"))
    }

    fun unpair() {
        cancelSync()
        BackgroundSyncWorker.cancel(context)
        credentials.clearPairing()
        syncState.clear()
        syncLog.record(
            SyncLogLevel.INFO,
            SyncEventType.PAIRING,
            "Device unpaired locally",
        )
        _uiState.value = CompanionUiState(
            selectedTypes = credentials.selectedRecordTypes(),
            healthAvailable = _uiState.value.healthAvailable,
            backgroundReadAvailable = _uiState.value.backgroundReadAvailable,
            statusMessage = "Device unpaired",
        )
        refresh()
    }

    fun resetCompanion() {
        cancelSync()
        BackgroundSyncWorker.cancel(context)
        credentials.reset()
        syncState.clear()
        syncLog.clear()
        _uiState.value = CompanionUiState(statusMessage = "Companion reset")
        refresh()
    }

    private fun enableBackgroundSync() {
        credentials.saveBackgroundSyncEnabled(true)
        BackgroundSyncWorker.schedule(context)
        _uiState.update {
            it.copy(
                backgroundSyncEnabled = true,
                nextBackgroundSyncAt = syncState.nextBackgroundSyncAt(),
                statusMessage = "Background sync enabled",
            )
        }
        syncLog.record(
            SyncLogLevel.INFO,
            SyncEventType.BACKGROUND,
            "Background sync enabled",
        )
    }

    private fun startSync(recordTypes: Set<String>) {
        if (syncJob?.isActive == true) return
        val initial = recordTypes.map { recordType ->
            CategorySyncUiState(recordType, status = CategorySyncStatus.WAITING)
        }
        syncState.saveCategories(initial)
        mergeCategoryStates(initial)
        _uiState.update {
            it.copy(
                syncRunning = true,
                statusMessage = "Syncing ${recordTypes.size} categories",
            )
        }
        syncLog.record(
            SyncLogLevel.INFO,
            SyncEventType.SYNC_STARTED,
            "Manual sync started for ${recordTypes.size} categories",
        )

        syncJob = viewModelScope.launch {
            try {
                val results = healthSync.syncSelected(
                    classesFor(recordTypes),
                    onProgress = ::onSyncProgress,
                )
                val finalStates = results.map { (recordType, outcome) ->
                    when (outcome.result) {
                        CategorySyncResult.COMPLETE -> currentCategory(recordType).copy(
                            status = CategorySyncStatus.COMPLETE,
                            remainingRecords = 0,
                            hasMore = false,
                            message = null,
                        )

                        CategorySyncResult.PERMISSION_REVOKED -> currentCategory(recordType).copy(
                            status = CategorySyncStatus.PERMISSION_REQUIRED,
                            message = outcome.message ?: "Health Connect access was revoked",
                        )

                        CategorySyncResult.ERROR -> currentCategory(recordType).copy(
                            status = CategorySyncStatus.ERROR,
                            message = outcome.message ?: "Sync failed",
                        )
                    }
                }
                syncState.saveCategories(finalStates)
                mergeCategoryStates(finalStates)

                results.forEach { (recordType, outcome) ->
                    syncLog.record(
                        level = when (outcome.result) {
                            CategorySyncResult.COMPLETE -> SyncLogLevel.INFO
                            CategorySyncResult.PERMISSION_REVOKED -> SyncLogLevel.WARNING
                            CategorySyncResult.ERROR -> SyncLogLevel.ERROR
                        },
                        type = if (outcome.result == CategorySyncResult.PERMISSION_REVOKED) {
                            SyncEventType.PERMISSION
                        } else {
                            SyncEventType.CATEGORY
                        },
                        message = when (outcome.result) {
                            CategorySyncResult.COMPLETE -> "${recordTypeLabel(recordType)} sync completed"
                            CategorySyncResult.PERMISSION_REVOKED -> "${recordTypeLabel(recordType)} needs Health Connect access"
                            CategorySyncResult.ERROR -> "${recordTypeLabel(recordType)} sync failed"
                        },
                        category = recordType,
                        detail = outcome.message,
                    )
                }

                val failed = results.values.count { it.result == CategorySyncResult.ERROR }
                val permissions = results.values.count { it.result == CategorySyncResult.PERMISSION_REVOKED }
                if (failed == 0 && permissions == 0) {
                    val now = System.currentTimeMillis()
                    syncState.saveLastSuccessfulSyncAt(now)
                    syncLog.record(
                        SyncLogLevel.INFO,
                        SyncEventType.SYNC_COMPLETED,
                        "Manual sync completed successfully",
                    )
                    _uiState.update {
                        it.copy(
                            lastSuccessfulSyncAt = now,
                            statusMessage = "Sync complete",
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(
                            statusMessage = when {
                                failed > 0 -> "$failed categories need a retry"
                                else -> "$permissions categories need Health Connect access"
                            },
                        )
                    }
                }
            } catch (e: CancellationException) {
                val cancelledStates = _uiState.value.categories
                    .filter { it.recordType in recordTypes }
                    .filter {
                        it.status in setOf(
                            CategorySyncStatus.WAITING,
                            CategorySyncStatus.READING,
                            CategorySyncStatus.UPLOADING,
                            CategorySyncStatus.RETRYING,
                        )
                    }
                    .map { it.copy(status = CategorySyncStatus.CANCELLED, message = "Sync cancelled") }
                syncState.saveCategories(cancelledStates)
                mergeCategoryStates(cancelledStates)
                syncLog.record(
                    SyncLogLevel.WARNING,
                    SyncEventType.CANCELLED,
                    "Manual sync cancelled",
                )
                _uiState.update { it.copy(statusMessage = "Sync cancelled safely") }
                throw e
            } finally {
                _uiState.update { it.copy(syncRunning = false) }
                syncJob = null
            }
        }
    }

    private fun onSyncProgress(progress: SyncProgressUpdate) {
        val previous = currentCategory(progress.recordType)
        val state = CategorySyncUiState(
            recordType = progress.recordType,
            status = progress.status,
            discoveredRecords = if (progress.discoveredRecords == 0 && previous.discoveredRecords > 0) {
                previous.discoveredRecords
            } else {
                progress.discoveredRecords
            },
            uploadedRecords = if (progress.uploadedRecords == 0 && previous.uploadedRecords > 0) {
                previous.uploadedRecords
            } else {
                progress.uploadedRecords
            },
            remainingRecords = progress.remainingRecords,
            hasMore = progress.hasMore,
            message = progress.message,
        )
        syncState.saveCategory(state)
        mergeCategoryStates(listOf(state))
        if (progress.status == CategorySyncStatus.RETRYING) {
            syncLog.record(
                SyncLogLevel.WARNING,
                SyncEventType.RETRY,
                "${recordTypeLabel(progress.recordType)} is retrying",
                category = progress.recordType,
                detail = progress.message,
            )
        }
    }

    private fun markPermissionRequired(recordTypes: Set<String>) {
        val states = recordTypes.map { recordType ->
            currentCategory(recordType).copy(
                status = CategorySyncStatus.PERMISSION_REQUIRED,
                message = "Health Connect access is required",
            )
        }
        syncState.saveCategories(states)
        mergeCategoryStates(states)
        syncLog.record(
            SyncLogLevel.WARNING,
            SyncEventType.PERMISSION,
            "Health Connect permission was not granted for ${recordTypes.size} categories",
        )
    }

    private fun mergeCategoryStates(states: Collection<CategorySyncUiState>) {
        val replacements = states.associateBy { it.recordType }
        val persisted = syncState.categoryStates()
        _uiState.update { current ->
            val selected = current.selectedTypes
            val existing = current.categories.associateBy { it.recordType }
            current.copy(
                categories = selected.map { recordType ->
                    replacements[recordType]
                        ?: existing[recordType]
                        ?: persisted[recordType]
                        ?: CategorySyncUiState(recordType)
                }.sortedBy {
                    supportedTypeNames.indexOf(it.recordType).takeIf { index -> index >= 0 }
                        ?: Int.MAX_VALUE
                },
            )
        }
    }

    private fun currentCategory(recordType: String): CategorySyncUiState =
        _uiState.value.categories.firstOrNull { it.recordType == recordType }
            ?: syncState.categoryStates()[recordType]
            ?: CategorySyncUiState(recordType)

    private fun classesFor(recordTypes: Set<String>) = healthSync.supportedRecordTypes
        .filter { it.simpleName in recordTypes }
        .toSet()
}
