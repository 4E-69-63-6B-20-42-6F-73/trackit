package net.trackit.companion

import org.junit.Assert.assertEquals
import org.junit.Test

class HealthCategoryLabelsTest {
    @Test
    fun `uses human readable labels for health categories`() {
        assertEquals("Heart rate variability", healthCategoryLabel("HeartRateVariabilityRmssdRecord"))
        assertEquals("VO₂ max", healthCategoryLabel("Vo2MaxRecord"))
        assertEquals("Sleep sessions", healthCategoryLabel("SleepSessionRecord"))
        assertEquals("Weight", healthCategoryLabel("WeightRecord"))
    }
}
