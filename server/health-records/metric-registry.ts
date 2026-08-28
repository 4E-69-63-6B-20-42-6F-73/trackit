import {
    metricDefinition as catalogMetricDefinition,
    type DailyMetricAggregation,
} from '../../src/domain/metricCatalog.js'

// Compatibility adapter for server-side aggregation callers. Metric metadata
// remains authoritative in the shared catalog used by ingestion and the UI.
export function metricDefinition(key: string) {
    const definition = catalogMetricDefinition(key)
    return definition ? { ...definition, aggregation: definition.dailyAggregation } : undefined
}

export function aggregateMetric(
    aggregation: DailyMetricAggregation,
    values: { value: number; observedAt: Date }[],
) {
    if (!values.length) return undefined
    const numbers = values.map(row => row.value).sort((left, right) => left - right)
    switch (aggregation) {
        case 'sum':
            return numbers.reduce((sum, value) => sum + value, 0)
        case 'latest':
            return [...values].sort(
                (left, right) => right.observedAt.getTime() - left.observedAt.getTime(),
            )[0].value
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
