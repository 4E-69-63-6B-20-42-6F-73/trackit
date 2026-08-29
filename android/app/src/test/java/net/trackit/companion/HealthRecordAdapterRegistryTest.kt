package net.trackit.companion

import org.junit.Assert.assertEquals
import org.junit.Test

class HealthRecordAdapterRegistryTest {
    @Test
    fun `all supported categories have exactly one adapter`() {
        val names = HealthRecordAdapterRegistry.adapters.map { it.type.simpleName }

        assertEquals(19, names.size)
        assertEquals(names.size, names.toSet().size)
        assertEquals(
            setOf(
                "StepsRecord",
                "SleepSessionRecord",
                "WeightRecord",
                "HeartRateRecord",
                "RestingHeartRateRecord",
                "ExerciseSessionRecord",
                "HeartRateVariabilityRmssdRecord",
                "OxygenSaturationRecord",
                "RespiratoryRateRecord",
                "BloodPressureRecord",
                "BodyFatRecord",
                "HeightRecord",
                "DistanceRecord",
                "ActiveCaloriesBurnedRecord",
                "TotalCaloriesBurnedRecord",
                "Vo2MaxRecord",
                "HydrationRecord",
                "LeanBodyMassRecord",
                "BasalMetabolicRateRecord",
            ),
            names.toSet(),
        )
    }
}
