package net.trackit.companion

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class BackgroundSyncWorker(context: Context, parameters: WorkerParameters) :
    CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val store = CredentialStore(applicationContext)
        val syncLog = SyncLogStore(applicationContext)
        val syncState = SyncStateStore(applicationContext)
        return try {
            if (!store.backgroundSyncEnabled()) return Result.success()

            val sync = HealthConnectSync(applicationContext)
            if (sync.availability() != androidx.health.connect.client.HealthConnectClient.SDK_AVAILABLE) {
                syncLog.record(
                    SyncLogLevel.WARNING,
                    SyncEventType.BACKGROUND,
                    "Background sync skipped because Health Connect is unavailable",
                )
                return Result.success()
            }
            if (!sync.supportsBackgroundRead()) {
                syncLog.record(
                    SyncLogLevel.WARNING,
                    SyncEventType.BACKGROUND,
                    "Background sync skipped because background Health Connect reads are unsupported",
                )
                return Result.success()
            }

            val selected = store.selectedRecordTypes()
            val recordTypes = sync.supportedRecordTypes
                .filter { it.simpleName in selected }
                .toSet()
            if (recordTypes.isEmpty()) return Result.success()

            val required = sync.permissionsFor(recordTypes, includeBackground = true)
            if (!sync.hasPermissions(required)) {
                syncLog.record(
                    SyncLogLevel.WARNING,
                    SyncEventType.PERMISSION,
                    "Background sync paused because Health Connect permissions are missing",
                )
                val granted = sync.grantedPermissions()
                recordTypes.forEach { type ->
                    val name = type.simpleName.orEmpty()
                    val status = if (sync.permissionsFor(setOf(type)).all { it in granted }) {
                        CategorySyncStatus.IDLE
                    } else {
                        CategorySyncStatus.PERMISSION_REQUIRED
                    }
                    syncState.saveCategory(CategorySyncUiState(name, status = status))
                }
                return Result.success()
            }

            syncLog.record(
                SyncLogLevel.INFO,
                SyncEventType.BACKGROUND,
                "Background sync started for ${recordTypes.size} categories",
            )
            val results = sync.syncSelected(
                recordTypes,
                onProgress = { progress ->
                    syncState.saveCategory(
                        CategorySyncUiState(
                            recordType = progress.recordType,
                            status = progress.status,
                            discoveredRecords = progress.discoveredRecords,
                            uploadedRecords = progress.uploadedRecords,
                            remainingRecords = progress.remainingRecords,
                            hasMore = progress.hasMore,
                            message = progress.message,
                        ),
                    )
                },
            )
            results.forEach { (recordType, outcome) ->
                if (outcome.result == CategorySyncResult.PERMISSION_REVOKED) {
                    syncState.saveCategory(
                        CategorySyncUiState(
                            recordType = recordType,
                            status = CategorySyncStatus.PERMISSION_REQUIRED,
                            message = outcome.message,
                        ),
                    )
                } else if (outcome.result == CategorySyncResult.ERROR) {
                    syncState.saveCategory(
                        CategorySyncUiState(
                            recordType = recordType,
                            status = CategorySyncStatus.ERROR,
                            message = outcome.message,
                        ),
                    )
                }
            }

            val failed = results.values.count { it.result == CategorySyncResult.ERROR }
            val paused = results.values.count { it.result == CategorySyncResult.PERMISSION_REVOKED }
            val now = System.currentTimeMillis()
            syncState.saveLastBackgroundSyncAt(now)
            syncState.saveNextBackgroundSyncAt(now + SyncStateStore.BACKGROUND_INTERVAL_MILLIS)

            when {
                failed > 0 -> {
                    syncLog.record(
                        SyncLogLevel.ERROR,
                        SyncEventType.BACKGROUND,
                        "Background sync finished with $failed failed categories",
                    )
                    Result.retry()
                }

                paused > 0 -> {
                    syncLog.record(
                        SyncLogLevel.WARNING,
                        SyncEventType.BACKGROUND,
                        "Background sync finished with $paused categories waiting for permission",
                    )
                    Result.success()
                }

                else -> {
                    syncState.saveLastSuccessfulSyncAt(now)
                    syncLog.record(
                        SyncLogLevel.INFO,
                        SyncEventType.BACKGROUND,
                        "Background sync completed",
                    )
                    Result.success()
                }
            }
        } catch (e: Exception) {
            syncLog.record(
                SyncLogLevel.ERROR,
                SyncEventType.BACKGROUND,
                "Background sync failed",
                detail = e.message ?: "Unknown error",
            )
            Result.retry()
        }
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "trackit-health-connect-sync"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val work = PeriodicWorkRequestBuilder<BackgroundSyncWorker>(6, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                work,
            )
            SyncStateStore(context).saveNextBackgroundSyncAt(
                System.currentTimeMillis() + SyncStateStore.BACKGROUND_INTERVAL_MILLIS,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
            SyncStateStore(context).saveNextBackgroundSyncAt(null)
        }
    }
}
