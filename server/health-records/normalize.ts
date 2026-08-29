import type {
    CanonicalExercisePayload,
    CanonicalHealthRecord,
    CanonicalHealthRecordInput,
    ExerciseType,
    JsonObject,
} from './types.js'

const exerciseTypes = new Set<ExerciseType>([
    'other',
    'badminton',
    'baseball',
    'basketball',
    'biking',
    'biking_stationary',
    'boot_camp',
    'boxing',
    'calisthenics',
    'cricket',
    'dancing',
    'elliptical',
    'exercise_class',
    'fencing',
    'football_american',
    'football_australian',
    'frisbee_disc',
    'golf',
    'guided_breathing',
    'gymnastics',
    'handball',
    'high_intensity_interval_training',
    'hiking',
    'ice_hockey',
    'ice_skating',
    'martial_arts',
    'paddling',
    'paragliding',
    'pilates',
    'racquetball',
    'rock_climbing',
    'roller_hockey',
    'rowing',
    'rowing_machine',
    'rugby',
    'running',
    'running_treadmill',
    'sailing',
    'scuba_diving',
    'skating',
    'skiing',
    'snowboarding',
    'snowshoeing',
    'soccer',
    'softball',
    'squash',
    'stair_climbing',
    'stair_climbing_machine',
    'strength_training',
    'stretching',
    'surfing',
    'swimming_open_water',
    'swimming_pool',
    'table_tennis',
    'tennis',
    'volleyball',
    'walking',
    'water_polo',
    'weightlifting',
    'wheelchair',
    'yoga',
])

const healthConnectExerciseTypes: Record<number, ExerciseType> = {
    0: 'other',
    2: 'badminton',
    4: 'baseball',
    5: 'basketball',
    8: 'biking',
    9: 'biking_stationary',
    10: 'boot_camp',
    11: 'boxing',
    13: 'calisthenics',
    14: 'cricket',
    16: 'dancing',
    25: 'elliptical',
    26: 'exercise_class',
    27: 'fencing',
    28: 'football_american',
    29: 'football_australian',
    31: 'frisbee_disc',
    32: 'golf',
    33: 'guided_breathing',
    34: 'gymnastics',
    35: 'handball',
    36: 'high_intensity_interval_training',
    37: 'hiking',
    38: 'ice_hockey',
    39: 'ice_skating',
    44: 'martial_arts',
    46: 'paddling',
    47: 'paragliding',
    48: 'pilates',
    50: 'racquetball',
    51: 'rock_climbing',
    52: 'roller_hockey',
    53: 'rowing',
    54: 'rowing_machine',
    55: 'rugby',
    56: 'running',
    57: 'running_treadmill',
    58: 'sailing',
    59: 'scuba_diving',
    60: 'skating',
    61: 'skiing',
    62: 'snowboarding',
    63: 'snowshoeing',
    64: 'soccer',
    65: 'softball',
    66: 'squash',
    68: 'stair_climbing',
    69: 'stair_climbing_machine',
    70: 'strength_training',
    71: 'stretching',
    72: 'surfing',
    73: 'swimming_open_water',
    74: 'swimming_pool',
    75: 'table_tennis',
    76: 'tennis',
    78: 'volleyball',
    79: 'walking',
    80: 'water_polo',
    81: 'weightlifting',
    82: 'wheelchair',
    83: 'yoga',
}

const normalizedSource = (source: string) => source.trim().toLowerCase().replaceAll(' ', '_')

export function normalizeExerciseType(source: string, value: unknown): ExerciseType {
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')
        if (exerciseTypes.has(normalized as ExerciseType)) return normalized as ExerciseType
    }
    if (normalizedSource(source) === 'health_connect' && typeof value === 'number')
        return healthConnectExerciseTypes[value] ?? 'other'
    return 'other'
}

export function normalizeHealthRecordPayload(
    source: string,
    recordType: string,
    payload: JsonObject,
): JsonObject {
    if (recordType !== 'ExerciseSessionRecord') return payload
    return {
        ...payload,
        exerciseType: normalizeExerciseType(source, payload.exerciseType),
    } satisfies CanonicalExercisePayload
}

export function normalizeHealthRecordInput(
    input: CanonicalHealthRecordInput,
): CanonicalHealthRecordInput {
    return {
        ...input,
        payload: normalizeHealthRecordPayload(
            input.connector ?? input.provider,
            input.recordType,
            input.payload,
        ),
    }
}

export function normalizeHealthRecord(record: CanonicalHealthRecord): CanonicalHealthRecord {
    return {
        ...record,
        payload: normalizeHealthRecordPayload(
            record.connector ?? record.provider,
            record.recordType,
            record.payload,
        ),
    }
}
