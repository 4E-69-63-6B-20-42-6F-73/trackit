import { Alert, Text } from '@mantine/core'
import { dailySeries, pearsonCorrelation, type NumericObservation } from '../domain/health'
import { metricDefinition } from '../domain/metricCatalog'

const label = (definitionId: string) =>
    metricDefinition(definitionId)?.name ??
    definitionId.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())

export function CorrelationNote({
    observations,
    metric,
    comparisonMetric,
    start,
    days,
    timezone,
}: {
    observations: NumericObservation[]
    metric: string
    comparisonMetric: string
    start: Date
    days: number
    timezone: string
}) {
    const included = observations.filter(record => !record.excluded)
    const left = dailySeries(
        included.filter(record => record.definitionId === metric),
        start,
        days,
        timezone,
    )
    const right = dailySeries(
        included.filter(record => record.definitionId === comparisonMetric),
        start,
        days,
        timezone,
    )
    const pairs = left.flatMap((point, index) =>
        point.value !== null && right[index].value !== null
            ? [[point.value, right[index].value] as const]
            : [],
    )
    const correlation = pearsonCorrelation(
        pairs.map(pair => pair[0]),
        pairs.map(pair => pair[1]),
    )

    return (
        <Alert color="indigo" title={`${label(metric)} compared with ${label(comparisonMetric)}`}>
            <Text size="sm">
                {correlation === null
                    ? 'Not enough matched observations for a correlation.'
                    : `Correlation ${correlation.toFixed(2)} across ${pairs.length} matched days.`}{' '}
                This is a same-day association only; it does not establish causation.
            </Text>
        </Alert>
    )
}
