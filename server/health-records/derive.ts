import type { CanonicalHealthRecord, DerivedObservation, JsonObject } from './types.js'

const hours = (start: Date, end: Date) => Math.max(0, end.getTime() - start.getTime()) / 3_600_000
const minutes = (start: Date, end: Date) => Math.max(0, end.getTime() - start.getTime()) / 60_000
const finite = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined
const quantile = (values: number[], percentile: number) => {
    const ordered = [...values].sort((a, b) => a - b)
    if (!ordered.length) return undefined
    const position = (ordered.length - 1) * percentile
    const lower = Math.floor(position)
    const fraction = position - lower
    return ordered[lower] + (ordered[lower + 1] - ordered[lower] || 0) * fraction
}
const observation = (
    metric: string,
    value: number,
    unit: string,
    derivation: string,
    kind: DerivedObservation['kind'] = 'raw_metric',
): DerivedObservation => ({ metric, value, unit, kind, derivation, derivationVersion: 1 })

function scalar(payload: JsonObject, key: string, metric: string, unit: string) {
    const value = finite(payload[key])
    return value === undefined ? [] : [observation(metric, value, unit, `${metric}_projection`)]
}

function deriveSleep(record: CanonicalHealthRecord): DerivedObservation[] {
    if (!record.endTime) return []
    const result = [
        observation('sleep', hours(record.startTime, record.endTime), 'hours', 'sleep_summary'),
    ]
    const totals = new Map<string, number>()
    const stages = Array.isArray(record.payload.stages) ? record.payload.stages : []
    for (const stage of stages) {
        if (!stage || typeof stage !== 'object') continue
        const item = stage as JsonObject
        if (
            typeof item.type !== 'string' ||
            typeof item.start !== 'string' ||
            typeof item.end !== 'string'
        )
            continue
        const duration = hours(new Date(item.start), new Date(item.end))
        if (Number.isFinite(duration))
            totals.set(
                item.type.toLowerCase(),
                (totals.get(item.type.toLowerCase()) ?? 0) + duration,
            )
    }
    for (const [stage, metric] of [
        ['deep', 'sleep_deep'],
        ['rem', 'sleep_rem'],
        ['light', 'sleep_light'],
        ['awake', 'sleep_awake'],
    ] as const) {
        const value = totals.get(stage)
        if (value !== undefined)
            result.push(observation(metric, value, 'hours', 'sleep_summary', 'derived_metric'))
    }
    const awake = totals.get('awake') ?? 0
    const duration = hours(record.startTime, record.endTime)
    if (duration > 0)
        result.push(
            observation(
                'sleep_efficiency',
                Math.max(0, (duration - awake) / duration) * 100,
                '%',
                'sleep_summary',
                'derived_metric',
            ),
        )
    return result.map(item => ({ ...item, observedAt: record.endTime!, endedAt: record.endTime }))
}

function deriveHeartRate(record: CanonicalHealthRecord): DerivedObservation[] {
    const samples = (Array.isArray(record.payload.samples) ? record.payload.samples : [])
        .map(sample =>
            sample && typeof sample === 'object' ? finite((sample as JsonObject).bpm) : undefined,
        )
        .filter((value): value is number => value !== undefined)
    if (!samples.length) return []
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length
    const median = quantile(samples, 0.5)!
    const p95 = quantile(samples, 0.95)!
    return [
        observation('heart_rate', average, 'bpm', 'heart_rate_summary'),
        observation(
            'heart_rate_min',
            Math.min(...samples),
            'bpm',
            'heart_rate_summary',
            'derived_metric',
        ),
        observation(
            'heart_rate_max',
            Math.max(...samples),
            'bpm',
            'heart_rate_summary',
            'derived_metric',
        ),
        observation('heart_rate_median', median, 'bpm', 'heart_rate_summary', 'derived_metric'),
        observation('heart_rate_p95', p95, 'bpm', 'heart_rate_summary', 'derived_metric'),
        observation(
            'heart_rate_sample_count',
            samples.length,
            'count',
            'heart_rate_summary',
            'derived_metric',
        ),
    ]
}

function deriveBloodPressure(record: CanonicalHealthRecord) {
    const systolic = finite(record.payload.systolic)
    const diastolic = finite(record.payload.diastolic)
    if (systolic === undefined || diastolic === undefined) return []
    return [
        observation('blood_pressure_systolic', systolic, 'mmHg', 'blood_pressure_projection'),
        observation('blood_pressure_diastolic', diastolic, 'mmHg', 'blood_pressure_projection'),
        observation(
            'pulse_pressure',
            systolic - diastolic,
            'mmHg',
            'blood_pressure_summary',
            'derived_metric',
        ),
        observation(
            'map_estimate',
            (systolic + 2 * diastolic) / 3,
            'mmHg',
            'blood_pressure_summary',
            'derived_metric',
        ),
    ]
}

export function deriveRecord(record: CanonicalHealthRecord): DerivedObservation[] {
    const derived = (() => {
        switch (record.recordType) {
            case 'StepsRecord':
                return scalar(record.payload, 'count', 'steps', 'count')
            case 'SleepSessionRecord':
                return deriveSleep(record)
            case 'WeightRecord':
                return scalar(record.payload, 'kilograms', 'weight', 'kg')
            case 'HeartRateRecord':
                return deriveHeartRate(record)
            case 'RestingHeartRateRecord':
                return scalar(record.payload, 'bpm', 'resting_heart_rate', 'bpm')
            case 'ExerciseSessionRecord':
                return record.endTime
                    ? [
                          observation(
                              'exercise',
                              minutes(record.startTime, record.endTime),
                              'minutes',
                              'exercise_summary',
                          ),
                      ]
                    : []
            case 'BloodPressureRecord':
                return deriveBloodPressure(record)
            case 'HeartRateVariabilityRmssdRecord':
                return scalar(record.payload, 'milliseconds', 'hrv_rmssd', 'ms')
            case 'OxygenSaturationRecord':
                return scalar(record.payload, 'percentage', 'oxygen_saturation', '%')
            case 'RespiratoryRateRecord':
                return scalar(record.payload, 'rate', 'respiratory_rate', 'breaths/min')
            case 'BodyFatRecord':
                return scalar(record.payload, 'percentage', 'body_fat', '%')
            case 'HeightRecord':
                return scalar(record.payload, 'meters', 'height', 'm')
            case 'DistanceRecord':
                return scalar(record.payload, 'meters', 'distance', 'm')
            case 'ActiveCaloriesBurnedRecord':
                return scalar(record.payload, 'kilocalories', 'active_calories', 'kcal')
            case 'TotalCaloriesBurnedRecord':
                return scalar(record.payload, 'kilocalories', 'total_calories', 'kcal')
            case 'HydrationRecord':
                return scalar(record.payload, 'liters', 'hydration', 'L')
            case 'LeanBodyMassRecord':
                return scalar(record.payload, 'kilograms', 'lean_body_mass', 'kg')
            case 'BasalMetabolicRateRecord':
                return scalar(
                    record.payload,
                    'kilocaloriesPerDay',
                    'basal_metabolic_rate',
                    'kcal/day',
                )
            case 'Vo2MaxRecord':
                return scalar(
                    record.payload,
                    'millilitersPerMinuteKilogram',
                    'vo2_max',
                    'mL/kg/min',
                )
            default:
                return []
        }
    })()
    return derived.map(item => ({
        ...item,
        observedAt: item.observedAt ?? record.startTime,
        endedAt: item.endedAt === undefined ? record.endTime : item.endedAt,
    }))
}
