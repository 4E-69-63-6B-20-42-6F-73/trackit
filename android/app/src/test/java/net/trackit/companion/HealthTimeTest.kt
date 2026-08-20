package net.trackit.companion

import java.time.OffsetDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class HealthTimeTest {
    @Test
    fun `timezone travel preserves the observed instant`() {
        val beforeTravel = OffsetDateTime.parse("2026-03-28T22:30:00+01:00").toInstant()
        val afterTravel = OffsetDateTime.parse("2026-03-29T00:30:00+03:00").toInstant()

        assertEquals("2026-03-28T21:30:00Z", HealthTime.serialize(beforeTravel))
        assertEquals("2026-03-28T21:30:00Z", HealthTime.serialize(afterTravel))
    }

    @Test
    fun `daylight saving transition uses elapsed instants`() {
        val start = OffsetDateTime.parse("2026-03-29T01:30:00+01:00").toInstant()
        val end = OffsetDateTime.parse("2026-03-29T03:30:00+02:00").toInstant()

        assertEquals(1.0, HealthTime.hoursBetween(start, end), 0.0001)
    }
}
