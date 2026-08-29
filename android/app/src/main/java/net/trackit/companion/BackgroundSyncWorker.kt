package net.trackit.companion

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.Instant
import java.util.concurrent.TimeUnit

class BackgroundSyncWorker(context: Context, parameters: WorkerParameters) :
    CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = runCatching {
        val store = CredentialStore(applicationContext)
        if (!store.backgroundSyncEnabled()) return Result.success()
        if (!store.hasValidPairing()) return Result.failure()

        val sync = HealthConnectSync(applicationContext)
        if (sync.availability() != androidx.health.connect.client.HealthConnectClient.SDK_AVAILABLE) {
            return Result.success()
        }
        if (!sync.supportsBackgroundRead()) return Result.success()

        val selected = store.selectedRecordTypes()
        val recordTypes = sync.supportedRecordTypes
            .filter { it.simpleName in selected }
            .toSet()
        if (recordTypes.isEmpty()) return Result.success()

        val required = sync.permissionsFor(recordTypes, includeBackground = true)
        if (!sync.hasPermissions(required)) return Result.success()

        val results = sync.syncSelected(recordTypes)
        when {
            results.values.any { it == "authentication_failed" || it == "permanent_error" } -> {
                store.saveSyncError("The TrackIt connection needs attention")
                Result.failure()
            }
            results.values.any { it == "error" } -> {
                store.saveSyncError("A temporary synchronization error occurred")
                Result.retry()
            }
            results.values.any { it == "permission_revoked" } -> {
                store.saveSyncError("Health Connect access was revoked for one or more categories")
                Result.success()
            }
            else -> {
                store.saveSyncSuccess(Instant.now().toString())
                Result.success()
            }
        }
    }.getOrElse { error ->
        CredentialStore(applicationContext).saveSyncError(
            error.message ?: "Background synchronization failed",
        )
        Result.retry()
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
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
        }
    }
}
