package net.trackit.companion

enum class CategorySyncStatus {
    IDLE,
    WAITING,
    READING,
    UPLOADING,
    RETRYING,
    COMPLETE,
    ERROR,
    PERMISSION_REQUIRED,
    CANCELLED,
}

enum class CategorySyncResult {
    COMPLETE,
    PERMISSION_REVOKED,
    ERROR,
}

data class CategorySyncOutcome(
    val result: CategorySyncResult,
    val message: String? = null,
)

data class SyncProgressUpdate(
    val recordType: String,
    val status: CategorySyncStatus,
    val discoveredRecords: Int = 0,
    val uploadedRecords: Int = 0,
    val remainingRecords: Int = 0,
    val hasMore: Boolean = false,
    val message: String? = null,
)

data class CategorySyncUiState(
    val recordType: String,
    val status: CategorySyncStatus = CategorySyncStatus.IDLE,
    val discoveredRecords: Int = 0,
    val uploadedRecords: Int = 0,
    val remainingRecords: Int = 0,
    val hasMore: Boolean = false,
    val message: String? = null,
    val updatedAt: Long? = null,
)

data class CompanionUiState(
    val paired: Boolean = false,
    val serverUrl: String? = null,
    val deviceId: String? = null,
    val serverIdentity: String? = null,
    val healthAvailable: Boolean = false,
    val backgroundReadAvailable: Boolean = false,
    val selectedTypes: Set<String> = setOf("StepsRecord"),
    val backgroundSyncEnabled: Boolean = false,
    val syncRunning: Boolean = false,
    val statusMessage: String = "Not paired",
    val categories: List<CategorySyncUiState> = emptyList(),
    val lastSuccessfulSyncAt: Long? = null,
    val lastBackgroundSyncAt: Long? = null,
    val nextBackgroundSyncAt: Long? = null,
    val permissionRequest: Set<String>? = null,
) {
    val failedTypes: Set<String>
        get() = categories.filter { it.status == CategorySyncStatus.ERROR }.map { it.recordType }.toSet()

    val permissionRequiredTypes: Set<String>
        get() = categories.filter { it.status == CategorySyncStatus.PERMISSION_REQUIRED }.map { it.recordType }.toSet()
}

fun recordTypeLabel(value: String): String = value
    .removeSuffix("Record")
    .replace(Regex("([a-z0-9])([A-Z])"), "$1 $2")
