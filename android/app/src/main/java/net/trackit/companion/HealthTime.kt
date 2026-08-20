package net.trackit.companion

import java.time.Duration
import java.time.Instant

object HealthTime {
    fun serialize(value: Instant): String = value.toString()

    fun hoursBetween(start: Instant, end: Instant): Double =
        Duration.between(start, end).toMinutes() / 60.0
}
