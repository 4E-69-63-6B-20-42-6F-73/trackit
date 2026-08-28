import type { CanonicalHealthRecord, DerivedObservation } from './types.js'

type JournalCategory = 'Activity' | 'Sleep' | 'Measurements'

export type HealthRecordJournalProjection = {
    category: JournalCategory
    title: string
    detail: string
}

const definitions: Record<string, { title: string; category: JournalCategory; metrics: string[] }> =
    {
        SleepSessionRecord: {
            title: 'Sleep session',
            category: 'Sleep',
            metrics: ['sleep', 'sleep_deep', 'sleep_rem'],
        },
        WeightRecord: { title: 'Weight', category: 'Measurements', metrics: ['weight'] },
        ExerciseSessionRecord: { title: 'Exercise', category: 'Activity', metrics: ['exercise'] },
        BloodPressureRecord: {
            title: 'Blood pressure',
            category: 'Measurements',
            metrics: ['blood_pressure_systolic', 'blood_pressure_diastolic'],
        },
        BodyFatRecord: { title: 'Body fat', category: 'Measurements', metrics: ['body_fat'] },
        HeightRecord: { title: 'Height', category: 'Measurements', metrics: ['height'] },
        Vo2MaxRecord: { title: 'VO₂ max', category: 'Measurements', metrics: ['vo2_max'] },
        HydrationRecord: { title: 'Hydration', category: 'Measurements', metrics: ['water'] },
        LeanBodyMassRecord: {
            title: 'Lean body mass',
            category: 'Measurements',
            metrics: ['lean_body_mass'],
        },
    }

const metricLabel = (metric: string) =>
    metric
        .replace('blood_pressure_', '')
        .replaceAll('_', ' ')
        .replace(/^./, value => value.toUpperCase())

const humanizeExerciseType = (value: unknown) =>
    typeof value === 'string' && value.trim()
        ? value.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase())
        : null

const format = (observation: DerivedObservation) => {
    const precision = ['hours', 'kg', 'm', '%', 'L'].includes(observation.unit) ? 1 : 0
    return `${metricLabel(observation.metric)} ${observation.value.toFixed(precision)} ${observation.unit}`
}

/**
 * Returns one row for an intentional measurement or meaningful session. Passive interval and
 * time-series records remain available through observations/daily metrics without flooding the
 * human-readable journal.
 */
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
        record.recordType === 'ExerciseSessionRecord'
            ? typeof record.payload.title === 'string' && record.payload.title.trim()
                ? record.payload.title
                : (humanizeExerciseType(record.payload.exerciseType) ?? definition.title)
            : definition.title
    return { category: definition.category, title, detail: summaries.join(' · ') }
}
