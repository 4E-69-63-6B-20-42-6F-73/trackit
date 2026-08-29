import type { CanonicalHealthRecord, DerivedObservation, JsonObject } from './types.js'

type JournalCategory = 'Activity' | 'Sleep' | 'Measurements'

type SleepStageDetail = {
    type: 'awake' | 'rem' | 'light' | 'deep' | 'unknown'
    start: string
    end: string
}

type JournalDetailView = {
    kind: 'sleep'
    stages: SleepStageDetail[]
}

export type JournalProjectedDetail = {
    projectionVersion: 1
    summary: string
    startedAt?: string
    endedAt?: string
    detailView?: JournalDetailView
}

export type HealthRecordJournalProjection = {
    category: JournalCategory
    title: string
    detail: JournalProjectedDetail
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
        HydrationRecord: { title: 'Hydration', category: 'Measurements', metrics: ['hydration'] },
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
    return `${metricLabel(observation.definitionId)} ${observation.value.toFixed(precision)} ${observation.unit}`
}

const normalizedSleepStages = (record: CanonicalHealthRecord): SleepStageDetail[] => {
    if (record.recordType !== 'SleepSessionRecord') return []

    // Provider-aware normalization belongs at this ingestion/projection boundary. Future connectors
    // can map their source semantics here without leaking provider records into Journal/read models.
    const stages = Array.isArray(record.payload.stages) ? record.payload.stages : []
    return stages.flatMap(stage => {
        if (!stage || typeof stage !== 'object') return []
        const item = stage as JsonObject
        if (
            typeof item.type !== 'string' ||
            typeof item.start !== 'string' ||
            typeof item.end !== 'string'
        )
            return []
        const normalized = item.type.toLowerCase()
        const type: SleepStageDetail['type'] = ['awake', 'rem', 'light', 'deep'].includes(
            normalized,
        )
            ? (normalized as SleepStageDetail['type'])
            : 'unknown'
        return [{ type, start: item.start, end: item.end }]
    })
}

/**
 * Provider-aware projection boundary. Source records are interpreted here and normalized into
 * observation-backed Journal semantics. Downstream Journal/read-model code must never need the
 * provider record itself.
 */
export function projectHealthRecordToJournal(
    record: CanonicalHealthRecord,
    observations: DerivedObservation[],
): HealthRecordJournalProjection | null {
    const definition = definitions[record.recordType]
    if (!definition || !observations.length) return null
    const summaries = definition.metrics
        .flatMap(
            metric => observations.find(observation => observation.definitionId === metric) ?? [],
        )
        .map(format)
    if (!summaries.length) return null
    const title =
        record.recordType === 'ExerciseSessionRecord'
            ? typeof record.payload.title === 'string' && record.payload.title.trim()
                ? record.payload.title
                : (humanizeExerciseType(record.payload.exerciseType) ?? definition.title)
            : definition.title
    const stages = normalizedSleepStages(record)
    return {
        category: definition.category,
        title,
        detail: {
            projectionVersion: 1,
            summary: summaries.join(' · '),
            startedAt: record.startTime.toISOString(),
            endedAt: record.endTime?.toISOString(),
            detailView: stages.length ? { kind: 'sleep', stages } : undefined,
        },
    }
}
