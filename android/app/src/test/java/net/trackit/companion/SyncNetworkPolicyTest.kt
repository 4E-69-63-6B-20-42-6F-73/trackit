package net.trackit.companion

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SyncNetworkPolicyTest {
    @Test
    fun `large upload is split with stable idempotency keys`() {
        val records = (0 until 601).toList()

        val batches = UploadBatchPlanner.plan("batch-key", records)

        assertEquals(listOf(250, 250, 101), batches.map { it.records.size })
        assertEquals(
            listOf("batch-key:0", "batch-key:1", "batch-key:2"),
            batches.map { it.idempotencyKey },
        )
        assertEquals(records, batches.flatMap { it.records })
    }

    @Test
    fun `small upload keeps caller idempotency key`() {
        val batches = UploadBatchPlanner.plan("same-key", listOf(1, 2, 3))

        assertEquals(1, batches.size)
        assertEquals("same-key", batches.single().idempotencyKey)
    }

    @Test
    fun `server retries use bounded exponential backoff`() {
        assertEquals(1_000L, ApiRetryPolicy.forHttp(500, null, 0)?.delayMillis)
        assertEquals(16_000L, ApiRetryPolicy.forHttp(503, null, 4)?.delayMillis)
        assertEquals(16_000L, ApiRetryPolicy.forHttp(503, null, 10)?.delayMillis)
        assertEquals(12_000L, ApiRetryPolicy.forHttp(503, 12_000L, 2)?.delayMillis)
    }

    @Test
    fun `rate limits and network failures have explicit retry reasons`() {
        assertEquals("Server is busy", ApiRetryPolicy.forHttp(429, null, 0)?.reason)
        assertEquals("Can't resolve the server address", ApiRetryPolicy.forIo(true, 0).reason)
        assertEquals("Connection interrupted", ApiRetryPolicy.forIo(false, 0).reason)
        assertNull(ApiRetryPolicy.forHttp(400, null, 0))
    }
}
