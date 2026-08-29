package net.trackit.companion

fun healthCategoryLabel(recordType: String): String = when (recordType) {
    "HrvRecord", "HeartRateVariabilityRmssdRecord" -> "Heart rate variability"
    "Vo2MaxRecord" -> "VO₂ max"
    "RestingHeartRateRecord" -> "Resting heart rate"
    "HeartRateRecord" -> "Heart rate"
    "BloodPressureRecord" -> "Blood pressure"
    "BodyFatRecord" -> "Body fat"
    "LeanBodyMassRecord" -> "Lean body mass"
    "BasalMetabolicRateRecord" -> "Basal metabolic rate"
    "ActiveCaloriesBurnedRecord" -> "Active calories"
    "TotalCaloriesBurnedRecord" -> "Total calories"
    "OxygenSaturationRecord" -> "Oxygen saturation"
    "RespiratoryRateRecord" -> "Respiratory rate"
    "ExerciseSessionRecord" -> "Exercise sessions"
    "SleepSessionRecord" -> "Sleep sessions"
    else -> recordType.removeSuffix("Record")
        .replace(Regex("([a-z])([A-Z])"), "$1 $2")
        .replaceFirstChar { it.uppercase() }
}
