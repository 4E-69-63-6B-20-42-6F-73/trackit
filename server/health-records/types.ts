export type JsonObject = Record<string, unknown>

export type ExerciseType =
    | 'other'
    | 'badminton'
    | 'baseball'
    | 'basketball'
    | 'biking'
    | 'biking_stationary'
    | 'boot_camp'
    | 'boxing'
    | 'calisthenics'
    | 'cricket'
    | 'dancing'
    | 'elliptical'
    | 'exercise_class'
    | 'fencing'
    | 'football_american'
    | 'football_australian'
    | 'frisbee_disc'
    | 'golf'
    | 'guided_breathing'
    | 'gymnastics'
    | 'handball'
    | 'high_intensity_interval_training'
    | 'hiking'
    | 'ice_hockey'
    | 'ice_skating'
    | 'martial_arts'
    | 'paddling'
    | 'paragliding'
    | 'pilates'
    | 'racquetball'
    | 'rock_climbing'
    | 'roller_hockey'
    | 'rowing'
    | 'rowing_machine'
    | 'rugby'
    | 'running'
    | 'running_treadmill'
    | 'sailing'
    | 'scuba_diving'
    | 'skating'
    | 'skiing'
    | 'snowboarding'
    | 'snowshoeing'
    | 'soccer'
    | 'softball'
    | 'squash'
    | 'stair_climbing'
    | 'stair_climbing_machine'
    | 'strength_training'
    | 'stretching'
    | 'surfing'
    | 'swimming_open_water'
    | 'swimming_pool'
    | 'table_tennis'
    | 'tennis'
    | 'volleyball'
    | 'walking'
    | 'water_polo'
    | 'weightlifting'
    | 'wheelchair'
    | 'yoga'

export type CanonicalExercisePayload = JsonObject & {
    exerciseType: ExerciseType
    title?: string
    notes?: string
}

export type CanonicalHealthRecordInput = {
    connector?: string
    provider: string
    recordType: string
    externalId: string
    externalVersion: number
    startTime: string
    endTime?: string
    dataOrigin?: string
    recordingMethod?: string
    device?: JsonObject
    payload: JsonObject
    lastModifiedTime?: string
    deleted?: boolean
}

export type CanonicalHealthRecord = Omit<CanonicalHealthRecordInput, 'startTime' | 'endTime'> & {
    id: string
    userId: string
    startTime: Date
    endTime: Date | null
}

export type DerivedObservation = {
    definitionId: string
    value: number
    unit: string
    originalValue?: number
    originalUnit?: string
    observedAt?: Date
    endedAt?: Date | null
    kind: 'raw_metric' | 'derived_metric'
    derivation: string
    derivationVersion: number
}
