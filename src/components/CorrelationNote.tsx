import { Alert, Text } from '@mantine/core'
import { dailySeries, pearsonCorrelation, type Observation } from '../domain/health'

export function CorrelationNote({
    observations,
    metric,
    comparisonMetric,
    start,
    days,
    timezone,
}: {
    observations: Observation[]
    metric: string
    comparisonMetric: string
    start: Date
    days: number
    timezone: string
}) {
    const left = dailySeries(
        observations.filter(record => record.definitionId === metric),
        start,
        days,
        timezone,
    )
    const right = dailySeries(
        observations.filter(record => record.definitionId === comparisonMetric),
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
        <Alert color="indigo" title={`${metric} compared with ${comparisonMetric}`}>
            <Text size="sm">
                {correlation === null
                    ? 'Not enough matched observations for a correlation.'
                    : `Correlation ${correlation.toFixed(2)} across ${pairs.length} matched days.`}{' '}
                Window: {days} days. Lag: 0 days. This association does not establish causation.
            </Text>
        </Alert>
    )
}
