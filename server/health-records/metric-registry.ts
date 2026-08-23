export type Aggregation = 'sum' | 'latest' | 'average' | 'median' | 'max'

export type MetricDefinition = {
    key: string
    label: string
    category: 'activity' | 'body' | 'cardiovascular' | 'recovery' | 'sleep'
    canonicalUnit: string
    aggregation: Aggregation
    displayPrecision: number
}

const definitions: MetricDefinition[] = [
    {
        key: 'steps',
        label: 'Steps',
        category: 'activity',
        canonicalUnit: 'count',
        aggregation: 'sum',
        displayPrecision: 0,
    },
    {
        key: 'distance',
        label: 'Distance',
        category: 'activity',
        canonicalUnit: 'm',
        aggregation: 'sum',
        displayPrecision: 0,
    },
    {
        key: 'active_calories',
        label: 'Active calories',
        category: 'activity',
        canonicalUnit: 'kcal',
        aggregation: 'sum',
        displayPrecision: 0,
    },
    {
        key: 'total_calories',
        label: 'Total calories',
        category: 'activity',
        canonicalUnit: 'kcal',
        aggregation: 'sum',
        displayPrecision: 0,
    },
    {
        key: 'exercise',
        label: 'Exercise',
        category: 'activity',
        canonicalUnit: 'minutes',
        aggregation: 'sum',
        displayPrecision: 0,
    },
    {
        key: 'weight',
        label: 'Weight',
        category: 'body',
        canonicalUnit: 'kg',
        aggregation: 'latest',
        displayPrecision: 1,
    },
    {
        key: 'height',
        label: 'Height',
        category: 'body',
        canonicalUnit: 'm',
        aggregation: 'latest',
        displayPrecision: 2,
    },
    {
        key: 'body_fat',
        label: 'Body fat',
        category: 'body',
        canonicalUnit: '%',
        aggregation: 'latest',
        displayPrecision: 1,
    },
    {
        key: 'heart_rate',
        label: 'Heart rate',
        category: 'cardiovascular',
        canonicalUnit: 'bpm',
        aggregation: 'average',
        displayPrecision: 0,
    },
    {
        key: 'resting_heart_rate',
        label: 'Resting heart rate',
        category: 'cardiovascular',
        canonicalUnit: 'bpm',
        aggregation: 'median',
        displayPrecision: 0,
    },
    {
        key: 'blood_pressure_systolic',
        label: 'Systolic pressure',
        category: 'cardiovascular',
        canonicalUnit: 'mmHg',
        aggregation: 'average',
        displayPrecision: 0,
    },
    {
        key: 'blood_pressure_diastolic',
        label: 'Diastolic pressure',
        category: 'cardiovascular',
        canonicalUnit: 'mmHg',
        aggregation: 'average',
        displayPrecision: 0,
    },
    {
        key: 'hrv_rmssd',
        label: 'HRV (RMSSD)',
        category: 'recovery',
        canonicalUnit: 'ms',
        aggregation: 'median',
        displayPrecision: 0,
    },
    {
        key: 'oxygen_saturation',
        label: 'Oxygen saturation',
        category: 'recovery',
        canonicalUnit: '%',
        aggregation: 'median',
        displayPrecision: 1,
    },
    {
        key: 'respiratory_rate',
        label: 'Respiratory rate',
        category: 'recovery',
        canonicalUnit: 'breaths/min',
        aggregation: 'median',
        displayPrecision: 1,
    },
    {
        key: 'sleep',
        label: 'Sleep duration',
        category: 'sleep',
        canonicalUnit: 'hours',
        aggregation: 'sum',
        displayPrecision: 2,
    },
    {
        key: 'sleep_deep',
        label: 'Deep sleep',
        category: 'sleep',
        canonicalUnit: 'hours',
        aggregation: 'sum',
        displayPrecision: 2,
    },
    {
        key: 'sleep_rem',
        label: 'REM sleep',
        category: 'sleep',
        canonicalUnit: 'hours',
        aggregation: 'sum',
        displayPrecision: 2,
    },
    {
        key: 'sleep_light',
        label: 'Light sleep',
        category: 'sleep',
        canonicalUnit: 'hours',
        aggregation: 'sum',
        displayPrecision: 2,
    },
    {
        key: 'sleep_awake',
        label: 'Awake time',
        category: 'sleep',
        canonicalUnit: 'hours',
        aggregation: 'sum',
        displayPrecision: 2,
    },
]

export const metricRegistry = new Map(definitions.map(definition => [definition.key, definition]))

export function metricDefinition(key: string) {
    return metricRegistry.get(key)
}

export function aggregateMetric(
    aggregation: Aggregation,
    values: { value: number; observedAt: Date }[],
) {
    if (!values.length) return undefined
    const numbers = values.map(row => row.value).sort((a, b) => a - b)
    switch (aggregation) {
        case 'sum':
            return numbers.reduce((sum, value) => sum + value, 0)
        case 'latest':
            return [...values].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0]
                .value
        case 'median': {
            const middle = Math.floor(numbers.length / 2)
            return numbers.length % 2
                ? numbers[middle]
                : (numbers[middle - 1] + numbers[middle]) / 2
        }
        case 'max':
            return Math.max(...numbers)
        case 'average':
            return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    }
}
