package net.trackit.companion

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class BackgroundSyncWorker(context: Context, parameters: WorkerParameters) :
    CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result = runCatching {
        val sync = HealthConnectSync(applicationContext)
        val selected = CredentialStore(applicationContext).selectedRecordTypes()
        sync.syncSelected(sync.supportedRecordTypes.filter { it.simpleName in selected }.toSet())
        Result.success()
    }.getOrElse { Result.retry() }

    companion object {
        fun schedule(context: Context) {
            val work = PeriodicWorkRequestBuilder<BackgroundSyncWorker>(6, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "trackit-health-connect-sync",
                ExistingPeriodicWorkPolicy.UPDATE,
                work,
            )
        }
    }
}
