package net.trackit.companion

import java.util.UUID

data class PlannedUpload<T>(
    val idempotencyKey: String,
    val records: List<T>,
)

object UploadBatchPlanner {
    const val MAX_UPLOAD_RECORDS = 1000

    fun <T> plan(
        idempotencyKey: String,
        records: List<T>,
        maxRecords: Int = MAX_UPLOAD_RECORDS,
    ): List<PlannedUpload<T>> {
        require(maxRecords > 0)
        require(runCatching { UUID.fromString(idempotencyKey) }.isSuccess) {
            "idempotencyKey must be a UUID"
        }
        if (records.isEmpty()) return emptyList()
        if (records.size <= maxRecords) return listOf(PlannedUpload(idempotencyKey, records))
        return records.chunked(maxRecords).mapIndexed { index, batch ->
            PlannedUpload(
                UUID.nameUUIDFromBytes(
                    "$idempotencyKey:$index".toByteArray(Charsets.UTF_8),
                ).toString(),
                batch,
            )
        }
    }
}

class AdaptiveUploadBatchLimits(
    private val readLimit: (String) -> Int?,
    private val writeLimit: (String, Int) -> Unit,
) {
    fun limitFor(recordType: String): Int =
        (readLimit(recordType) ?: UploadBatchPlanner.MAX_UPLOAD_RECORDS)
            .coerceIn(1, UploadBatchPlanner.MAX_UPLOAD_RECORDS)

    @Synchronized
    fun downgrade(recordType: String, failedBatchSize: Int): Int {
        require(failedBatchSize > 1)
        val current = limitFor(recordType)
        val reduced = minOf(current, (failedBatchSize / 2).coerceAtLeast(1))
        writeLimit(recordType, reduced)
        return reduced
    }
}

data class ApiRetryDecision(
    val reason: String,
    val delayMillis: Long,
)

object ApiRetryPolicy {
    fun forHttp(
        statusCode: Int,
        retryAfterMillis: Long?,
        zeroBasedAttempt: Int,
    ): ApiRetryDecision? = when {
        statusCode == 429 -> ApiRetryDecision(
            reason = "Server is busy",
            delayMillis = retryAfterMillis ?: 30_000L,
        )

        statusCode in 500..599 -> ApiRetryDecision(
            reason = "Server is temporarily unavailable",
            delayMillis = retryAfterMillis ?: exponentialDelay(zeroBasedAttempt),
        )

        else -> null
    }

    fun forIo(
        unknownHost: Boolean,
        zeroBasedAttempt: Int,
    ) = ApiRetryDecision(
        reason = if (unknownHost) "Can't resolve the server address" else "Connection interrupted",
        delayMillis = exponentialDelay(zeroBasedAttempt),
    )

    private fun exponentialDelay(zeroBasedAttempt: Int): Long =
        1_000L shl zeroBasedAttempt.coerceIn(0, 4)
}
