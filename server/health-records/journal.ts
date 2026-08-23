import type { CanonicalHealthRecord, DerivedObservation } from './types.js'

type JournalCategory = 'Activity' | 'Sleep' | 'Measurements'

export type HealthRecordJournalProjection = {
    category: JournalCategory
    title: string
    detail: string
}

const definitions: Record<string, { title: string; category: JournalCategory; metrics: string[] }> =
    {
        StepsRecord: { title: 'Steps', category: 'Activity', metrics: ['steps'] },
        SleepSessionRecord: {
            title: 'Sleep session',
            category: 'Sleep',
            metrics: ['sleep', 'sleep_deep', 'sleep_rem'],
        },
        WeightRecord: { title: 'Weight', category: 'Measurements', metrics: ['weight'] },
        HeartRateRecord: {
            title: 'Heart rate',
            category: 'Measurements',
            metrics: ['heart_rate', 'heart_rate_min', 'heart_rate_max'],
        },
        RestingHeartRateRecord: {
            title: 'Resting heart rate',
            category: 'Measurements',
            metrics: ['resting_heart_rate'],
        },
        ExerciseSessionRecord: { title: 'Exercise', category: 'Activity', metrics: ['exercise'] },
        BloodPressureRecord: {
            title: 'Blood pressure',
            category: 'Measurements',
            metrics: ['blood_pressure_systolic', 'blood_pressure_diastolic'],
        },
        HeartRateVariabilityRmssdRecord: {
            title: 'Heart rate variability',
            category: 'Measurements',
            metrics: ['hrv_rmssd'],
        },
        OxygenSaturationRecord: {
            title: 'Oxygen saturation',
            category: 'Measurements',
            metrics: ['oxygen_saturation'],
        },
        RespiratoryRateRecord: {
            title: 'Respiratory rate',
            category: 'Measurements',
            metrics: ['respiratory_rate'],
        },
        BodyFatRecord: { title: 'Body fat', category: 'Measurements', metrics: ['body_fat'] },
        HeightRecord: { title: 'Height', category: 'Measurements', metrics: ['height'] },
        DistanceRecord: { title: 'Distance', category: 'Activity', metrics: ['distance'] },
        ActiveCaloriesBurnedRecord: {
            title: 'Active calories',
            category: 'Activity',
            metrics: ['active_calories'],
        },
        TotalCaloriesBurnedRecord: {
            title: 'Total calories',
            category: 'Activity',
            metrics: ['total_calories'],
        },
        Vo2MaxRecord: { title: 'VO₂ max', category: 'Measurements', metrics: ['vo2_max'] },
        HydrationRecord: { title: 'Hydration', category: 'Measurements', metrics: ['hydration'] },
        LeanBodyMassRecord: {
            title: 'Lean body mass',
            category: 'Measurements',
            metrics: ['lean_body_mass'],
        },
        BasalMetabolicRateRecord: {
            title: 'Basal metabolic rate',
            category: 'Measurements',
            metrics: ['basal_metabolic_rate'],
        },
    }

const metricLabel = (metric: string) =>
    metric
        .replace('blood_pressure_', '')
        .replaceAll('_', ' ')
        .replace(/^./, value => value.toUpperCase())

const format = (observation: DerivedObservation) => {
    const precision = ['hours', 'kg', 'm', '%', 'L'].includes(observation.unit) ? 1 : 0
    return `${metricLabel(observation.metric)} ${observation.value.toFixed(precision)} ${observation.unit}`
}

/** Returns one concise journal row for a source record, never one row per derived observation. */
export function projectHealthRecordToJournal(
    record: CanonicalHealthRecord,
    observations: DerivedObservation[],
): HealthRecordJournalProjection | null {
    const definition = definitions[record.recordType]
    if (!definition || !observations.length) return null
    const summaries = definition.metrics
        .flatMap(metric => observations.find(observation => observation.metric === metric) ?? [])
        .map(format)
    if (!summaries.length) return null
    const title =
        record.recordType === 'ExerciseSessionRecord' && typeof record.payload.title === 'string'
            ? record.payload.title
            : definition.title
    return { category: definition.category, title, detail: summaries.join(' · ') }
}
