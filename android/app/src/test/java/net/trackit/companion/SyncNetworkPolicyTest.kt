package net.trackit.companion

import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncNetworkPolicyTest {
    private fun testUuid(seed: String): String =
        UUID.nameUUIDFromBytes(seed.toByteArray(Charsets.UTF_8)).toString()

    @Test
    fun `large upload is split with stable API-valid idempotency keys`() {
        val records = (0 until 2601).toList()
        val baseKey = testUuid("large-upload")

        val first = UploadBatchPlanner.plan(baseKey, records)
        val second = UploadBatchPlanner.plan(baseKey, records)

        assertEquals(listOf(1000, 1000, 601), first.map { it.records.size })
        assertEquals(first.map { it.idempotencyKey }, second.map { it.idempotencyKey })
        assertTrue(first.all { runCatching { UUID.fromString(it.idempotencyKey) }.isSuccess })
        assertEquals(records, first.flatMap { it.records })
    }

    @Test
    fun `planner honors a smaller category limit`() {
        val records = (0 until 1201).toList()
        val baseKey = testUuid("smaller-category-limit")

        val batches = UploadBatchPlanner.plan(baseKey, records, maxRecords = 500)

        assertEquals(listOf(500, 500, 201), batches.map { it.records.size })
        assertEquals(records, batches.flatMap { it.records })
    }

    @Test
    fun `small upload keeps caller UUID`() {
        val key = testUuid("small-upload")
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
    fun `adaptive upload limits start at 1000 and downgrade per category`() {
        val stored = mutableMapOf<String, Int>()
        val limits = AdaptiveUploadBatchLimits(
            readLimit = { stored[it] },
            writeLimit = { recordType, limit -> stored[recordType] = limit },
        )

        assertEquals(1000, limits.limitFor("StepsRecord"))
        assertEquals(1000, limits.limitFor("HeartRateRecord"))
        assertEquals(500, limits.downgrade("HeartRateRecord", 1000))
        assertEquals(500, limits.limitFor("HeartRateRecord"))
        assertEquals(1000, limits.limitFor("StepsRecord"))
        assertEquals(250, limits.downgrade("HeartRateRecord", 500))
        assertEquals(250, limits.limitFor("HeartRateRecord"))
    }

    @Test
    fun `adaptive downgrade never raises an already lower category limit`() {
        val stored = mutableMapOf("HeartRateRecord" to 250)
        val limits = AdaptiveUploadBatchLimits(
            readLimit = { stored[it] },
            writeLimit = { recordType, limit -> stored[recordType] = limit },
        )

        assertEquals(250, limits.downgrade("HeartRateRecord", 1000))
        assertEquals(250, limits.limitFor("HeartRateRecord"))
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
