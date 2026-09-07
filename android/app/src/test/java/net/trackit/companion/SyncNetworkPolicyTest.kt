package net.trackit.companion

import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncNetworkPolicyTest {
    @Test
    fun `large upload is split with stable API-valid idempotency keys`() {
        val records = (0 until 2601).toList()
        val baseKey = "123e4567-e89b-12d3-a456-426614174000"

        val first = UploadBatchPlanner.plan(baseKey, records)
        val second = UploadBatchPlanner.plan(baseKey, records)

        assertEquals(listOf(1000, 1000, 601), first.map { it.records.size })
        assertEquals(first.map { it.idempotencyKey }, second.map { it.idempotencyKey })
        assertTrue(first.all { runCatching { UUID.fromString(it.idempotencyKey) }.isSuccess })
        assertEquals(records, first.flatMap { it.records })
    }

    @Test
    fun `small upload keeps caller UUID`() {
        val key = "123e4567-e89b-12d3-a456-426614174000"
        val batches = UploadBatchPlanner.plan(key, listOf(1, 2, 3))

        assertEquals(1, batches.size)
        assertEquals(key, batches.single().idempotencyKey)
    }

    @Test
    fun `invalid idempotency key is rejected before network use`() {
        assertThrows(IllegalArgumentException::class.java) {
            UploadBatchPlanner.plan("not-a-uuid", listOf(1))
        }
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
