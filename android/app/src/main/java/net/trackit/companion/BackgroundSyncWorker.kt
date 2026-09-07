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
        return try {
            if (!store.backgroundSyncEnabled()) return Result.success()

            val sync = HealthConnectSync(applicationContext)
            if (sync.availability() != androidx.health.connect.client.HealthConnectClient.SDK_AVAILABLE) {
                syncLog.warning("Background sync skipped because Health Connect is unavailable")
                return Result.success()
            }
            if (!sync.supportsBackgroundRead()) {
                syncLog.warning("Background sync skipped because background Health Connect reads are unsupported")
                return Result.success()
            }

            val selected = store.selectedRecordTypes()
            val recordTypes = sync.supportedRecordTypes
                .filter { it.simpleName in selected }
                .toSet()
            if (recordTypes.isEmpty()) return Result.success()

            val required = sync.permissionsFor(recordTypes, includeBackground = true)
            if (!sync.hasPermissions(required)) {
                syncLog.warning("Background sync skipped because selected Health Connect permissions are missing")
                return Result.success()
            }

            syncLog.info("Background sync started for ${recordTypes.size} categories")
            val results = sync.syncSelected(recordTypes)
            val failed = results.values.count { it == "error" }
            val paused = results.values.count { it == "permission_revoked" }
            when {
                failed > 0 -> syncLog.error("Background sync finished with $failed failed categories")
                paused > 0 -> syncLog.warning("Background sync finished with $paused paused categories")
                else -> syncLog.info("Background sync completed")
            }
            Result.success()
        } catch (e: Exception) {
            syncLog.error("Background sync failed: ${e.message ?: "Unknown error"}")
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
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK_NAME)
        }
    }
}
