package net.trackit.companion

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import java.time.Instant
import kotlin.reflect.KClass
import org.json.JSONArray
import org.json.JSONObject

interface HealthRecordAdapter<T : Record> {
    val type: KClass<T>
    fun serialize(record: T): TrackItHealthRecord
}

private fun Record.canonical(
    recordType: String,
    startTime: Instant,
    endTime: Instant?,
    payload: JSONObject,
): TrackItHealthRecord {
    val metadata = metadata
    val device = metadata.device
    return TrackItHealthRecord(
        recordType = recordType,
        externalId = metadata.id,
        externalVersion = metadata.lastModifiedTime.toEpochMilli(),
        startTime = HealthTime.serialize(startTime),
        endTime = endTime?.let(HealthTime::serialize),
        dataOrigin = metadata.dataOrigin.packageName,
        recordingMethod = metadata.recordingMethod.toString(),
        device = JSONObject()
            .put("type", device?.type)
            .put("manufacturer", device?.manufacturer)
            .put("model", device?.model),
        payload = payload,
        lastModifiedTime = HealthTime.serialize(metadata.lastModifiedTime),
    )
}

object StepsAdapter : HealthRecordAdapter<StepsRecord> {
    override val type = StepsRecord::class
    override fun serialize(record: StepsRecord) = record.canonical(
        type.simpleName!!, record.startTime, record.endTime,
        JSONObject().put("count", record.count),
    )
}

object SleepSessionAdapter : HealthRecordAdapter<SleepSessionRecord> {
    override val type = SleepSessionRecord::class
    override fun serialize(record: SleepSessionRecord) = record.canonical(
        type.simpleName!!, record.startTime, record.endTime,
        JSONObject()
            .put("title", record.title)
            .put("notes", record.notes)
            .put("stages", JSONArray(record.stages.map { stage ->
                JSONObject()
                    .put("type", when (stage.stage) {
                        SleepSessionRecord.STAGE_TYPE_DEEP -> "deep"
                        SleepSessionRecord.STAGE_TYPE_REM -> "rem"
                        SleepSessionRecord.STAGE_TYPE_LIGHT -> "light"
                        SleepSessionRecord.STAGE_TYPE_AWAKE,
                        SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
                        SleepSessionRecord.STAGE_TYPE_OUT_OF_BED -> "awake"
                        else -> "unknown"
                    })
                    .put("start", HealthTime.serialize(stage.startTime))
                    .put("end", HealthTime.serialize(stage.endTime))
            })),
    )
}

object WeightAdapter : HealthRecordAdapter<WeightRecord> {
    override val type = WeightRecord::class
    override fun serialize(record: WeightRecord) = record.canonical(
        type.simpleName!!, record.time, null,
        JSONObject().put("kilograms", record.weight.inKilograms),
    )
}

object HeartRateAdapter : HealthRecordAdapter<HeartRateRecord> {
    override val type = HeartRateRecord::class
    override fun serialize(record: HeartRateRecord) = record.canonical(
        type.simpleName!!, record.startTime, record.endTime,
        JSONObject().put("samples", JSONArray(record.samples.map { sample ->
            JSONObject()
                .put("time", HealthTime.serialize(sample.time))
                .put("bpm", sample.beatsPerMinute)
        })),
    )
}

object RestingHeartRateAdapter : HealthRecordAdapter<RestingHeartRateRecord> {
    override val type = RestingHeartRateRecord::class
    override fun serialize(record: RestingHeartRateRecord) = record.canonical(
        type.simpleName!!, record.time, null,
        JSONObject().put("bpm", record.beatsPerMinute),
    )
}

object ExerciseSessionAdapter : HealthRecordAdapter<ExerciseSessionRecord> {
    override val type = ExerciseSessionRecord::class
    override fun serialize(record: ExerciseSessionRecord) = record.canonical(
        type.simpleName!!, record.startTime, record.endTime,
        JSONObject()
            .put("exerciseType", record.exerciseType)
            .put("title", record.title)
            .put("notes", record.notes)
            .put("segments", JSONArray(record.segments.map { segment ->
                JSONObject()
                    .put("type", segment.segmentType)
                    .put("start", HealthTime.serialize(segment.startTime))
                    .put("end", HealthTime.serialize(segment.endTime))
                    .put("repetitions", segment.repetitions)
            }))
            .put("laps", JSONArray(record.laps.map { lap ->
                JSONObject()
                    .put("start", HealthTime.serialize(lap.startTime))
                    .put("end", HealthTime.serialize(lap.endTime))
                    .put("lengthMeters", lap.length?.inMeters)
            })),
    )
}

object HrvAdapter : HealthRecordAdapter<HeartRateVariabilityRmssdRecord> {
    override val type = HeartRateVariabilityRmssdRecord::class
    override fun serialize(record: HeartRateVariabilityRmssdRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject().put("milliseconds", record.heartRateVariabilityMillis))
}
object OxygenSaturationAdapter : HealthRecordAdapter<OxygenSaturationRecord> {
    override val type = OxygenSaturationRecord::class
    override fun serialize(record: OxygenSaturationRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject().put("percentage", record.percentage.value))
}
object RespiratoryRateAdapter : HealthRecordAdapter<RespiratoryRateRecord> {
    override val type = RespiratoryRateRecord::class
    override fun serialize(record: RespiratoryRateRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject().put("rate", record.rate))
}
object BloodPressureAdapter : HealthRecordAdapter<BloodPressureRecord> {
    override val type = BloodPressureRecord::class
    override fun serialize(record: BloodPressureRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject()
        .put("systolic", record.systolic.inMillimetersOfMercury)
        .put("diastolic", record.diastolic.inMillimetersOfMercury)
        .put("bodyPosition", record.bodyPosition)
        .put("measurementLocation", record.measurementLocation))
}
object BodyFatAdapter : HealthRecordAdapter<BodyFatRecord> {
    override val type = BodyFatRecord::class
    override fun serialize(record: BodyFatRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject().put("percentage", record.percentage.value))
}
object HeightAdapter : HealthRecordAdapter<HeightRecord> {
    override val type = HeightRecord::class
    override fun serialize(record: HeightRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject().put("meters", record.height.inMeters))
}
object DistanceAdapter : HealthRecordAdapter<DistanceRecord> {
    override val type = DistanceRecord::class
    override fun serialize(record: DistanceRecord) = record.canonical(type.simpleName!!, record.startTime, record.endTime, JSONObject().put("meters", record.distance.inMeters))
}
object ActiveCaloriesAdapter : HealthRecordAdapter<ActiveCaloriesBurnedRecord> {
    override val type = ActiveCaloriesBurnedRecord::class
    override fun serialize(record: ActiveCaloriesBurnedRecord) = record.canonical(type.simpleName!!, record.startTime, record.endTime, JSONObject().put("kilocalories", record.energy.inKilocalories))
}
object TotalCaloriesAdapter : HealthRecordAdapter<TotalCaloriesBurnedRecord> {
    override val type = TotalCaloriesBurnedRecord::class
    override fun serialize(record: TotalCaloriesBurnedRecord) = record.canonical(type.simpleName!!, record.startTime, record.endTime, JSONObject().put("kilocalories", record.energy.inKilocalories))
}
object Vo2MaxAdapter : HealthRecordAdapter<Vo2MaxRecord> {
    override val type = Vo2MaxRecord::class
    override fun serialize(record: Vo2MaxRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject()
        .put("millilitersPerMinuteKilogram", record.vo2MillilitersPerMinuteKilogram)
        .put("measurementMethod", record.measurementMethod))
}
object HydrationAdapter : HealthRecordAdapter<HydrationRecord> {
    override val type = HydrationRecord::class
    override fun serialize(record: HydrationRecord) = record.canonical(type.simpleName!!, record.startTime, record.endTime, JSONObject().put("liters", record.volume.inLiters))
}
object LeanBodyMassAdapter : HealthRecordAdapter<LeanBodyMassRecord> {
    override val type = LeanBodyMassRecord::class
    override fun serialize(record: LeanBodyMassRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject().put("kilograms", record.mass.inKilograms))
}
object BasalMetabolicRateAdapter : HealthRecordAdapter<BasalMetabolicRateRecord> {
    override val type = BasalMetabolicRateRecord::class
    override fun serialize(record: BasalMetabolicRateRecord) = record.canonical(type.simpleName!!, record.time, null, JSONObject().put("kilocaloriesPerDay", record.basalMetabolicRate.inKilocaloriesPerDay))
}

object HealthRecordAdapterRegistry {
    val adapters: List<HealthRecordAdapter<out Record>> = listOf(
        StepsAdapter,
        SleepSessionAdapter,
        WeightAdapter,
        HeartRateAdapter,
        RestingHeartRateAdapter,
        ExerciseSessionAdapter,
        HrvAdapter,
        OxygenSaturationAdapter,
        RespiratoryRateAdapter,
        BloodPressureAdapter,
        BodyFatAdapter,
        HeightAdapter,
        DistanceAdapter,
        ActiveCaloriesAdapter,
        TotalCaloriesAdapter,
        Vo2MaxAdapter,
        HydrationAdapter,
        LeanBodyMassAdapter,
        BasalMetabolicRateAdapter,
    )
    val supportedRecordTypes: List<KClass<out Record>> = adapters.map { it.type }

    @Suppress("UNCHECKED_CAST")
    fun serialize(record: Record): TrackItHealthRecord? =
        (adapters.firstOrNull { it.type == record::class } as? HealthRecordAdapter<Record>)
            ?.serialize(record)
}
