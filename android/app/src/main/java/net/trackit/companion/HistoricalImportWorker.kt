package net.trackit.companion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.health.connect.client.records.Record
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import kotlinx.coroutines.CancellationException
import kotlin.reflect.KClass

class HistoricalImportWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    companion object {
        const val WORK_NAME = "historical_import"
        const val KEY_DAYS = "days"
        const val KEY_RECORD_TYPES = "recordTypes"
        const val PROGRESS_JSON = "progressJson"
        const val RESULT_PROGRESS_JSON = "resultProgressJson"
        const val RESULT_UPLOADED = "uploaded"
        const val RESULT_ISSUES = "issues"
        const val RESULT_ERROR = "error"
        const val RESULT_FAILED_CATEGORIES = "failedCategories"
        const val RESULT_DAYS = "days"

        private const val CHANNEL_ID = "historical_import"
        private const val NOTIFICATION_ID = 3001
    }

    override suspend fun doWork(): Result {
        setForeground(foregroundInfo("Preparing historical upload…"))

        val days = inputData.getInt(KEY_DAYS, 30)
        val selectedNames = inputData.getStringArray(KEY_RECORD_TYPES)
            ?.filterNotNull()
            ?.toSet()
            .orEmpty()

        val healthSync = HealthConnectSync(applicationContext)

        val types: List<KClass<out Record>> = healthSync.supportedRecordTypes
            .filter { it.qualifiedName in selectedNames }

        if (types.isEmpty()) {
            return Result.failure(
                Data.Builder()
                    .putString(RESULT_ERROR, "No record types selected")
                    .putInt(RESULT_DAYS, days)
                    .build(),
            )
        }

        val states = linkedMapOf<String, HistoricalImportProgress>()

        types.forEachIndexed { index, type ->
            val category = type.simpleName.orEmpty()

            states[category] = HistoricalImportProgress(
                category = category,
                categoryIndex = index,
                totalCategories = types.size,
                phase = HistoricalImportPhase.PENDING,
            )
        }

        suspend fun publish(
            progress: HistoricalImportProgress? = null,
        ) {
            if (progress != null) {
                states[progress.category] = progress
            }

            setProgress(
                Data.Builder()
                    .putString(
                        PROGRESS_JSON,
                        HistoricalProgressCodec.encode(states.values),
                    )
                    .build(),
            )
        }

        publish()

        return try {
            val result = healthSync.importHistorical(
                recordTypes = types.toSet(),
                days = days,
                cancelled = { isStopped },
                onProgress = { progress ->
                    publish(progress)

                    val notificationText =
                        when (progress.phase) {
                            HistoricalImportPhase.WAITING_TO_RETRY ->
                                "${healthCategoryLabel(progress.category)}: retrying soon"

                            HistoricalImportPhase.COMPLETE ->
                                "${healthCategoryLabel(progress.category)}: complete"

                            else ->
                                "${healthCategoryLabel(progress.category)}: " +
                                    "${progress.uploadedRecords} uploaded"
                        }

                    setForeground(
                        foregroundInfo(notificationText),
                    )
                },
            )

            val failed: Array<String?> = result.issues.keys
                .map { it as String? }
                .toTypedArray()

            val finalJson =
                HistoricalProgressCodec.encode(states.values)

            Result.success(
                Data.Builder()
                    .putString(
                        RESULT_PROGRESS_JSON,
                        finalJson,
                    )
                    .putInt(
                        RESULT_UPLOADED,
                        result.uploadedRecords,
                    )
                    .putInt(
                        RESULT_ISSUES,
                        result.issues.size,
                    )
                    .putStringArray(
                        RESULT_FAILED_CATEGORIES,
                        failed,
                    )
                    .putInt(
                        RESULT_DAYS,
                        days,
                    )
                    .build(),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(
                Data.Builder()
                    .putString(
                        RESULT_PROGRESS_JSON,
                        HistoricalProgressCodec.encode(states.values),
                    )
                    .putString(
                        RESULT_ERROR,
                        e.message ?: "Unknown error",
                    )
                    .putInt(
                        RESULT_DAYS,
                        days,
                    )
                    .build(),
            )
        }
    }

    private fun foregroundInfo(
        text: String,
    ): ForegroundInfo {
        val manager = applicationContext.getSystemService(
            Context.NOTIFICATION_SERVICE,
        ) as NotificationManager

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Historical uploads",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )

        val notification = NotificationCompat.Builder(
            applicationContext,
            CHANNEL_ID,
        )
            .setSmallIcon(
                android.R.drawable.stat_sys_upload,
            )
            .setContentTitle(
                "TrackIt historical upload",
            )
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()

        return ForegroundInfo(
            NOTIFICATION_ID,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
        )
    }
}
