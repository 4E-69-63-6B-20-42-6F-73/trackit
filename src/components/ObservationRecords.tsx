import { Button, Group, Stack, Text } from '@mantine/core'
import type { NumericObservation } from '@trackit/domain/health'
import { formatMetricValue, friendlySourceName } from '@trackit/domain/formatting'

function sourceLabel(observation: NumericObservation) {
    const origin = observation.metadata?.dataOrigin
    if (typeof origin === 'string') return friendlySourceName(origin)
    if (observation.sourceId) return `source ${observation.sourceId}`
    return 'manual source'
}

export function ObservationRecords({
    observations,
    onToggleExcluded,
    showAll = false,
}: {
    observations: NumericObservation[]
    onToggleExcluded: (observation: NumericObservation) => void
    showAll?: boolean
}) {
    if (!observations.length) return null
    return (
        <Stack mt="lg" gap="xs">
            <Text className="eyebrow">UNDERLYING RECORDS</Text>
            {(showAll ? observations : observations.slice(0, 8)).map(observation => (
                <Group key={observation.id} justify="space-between" wrap="nowrap">
                    <div>
                        <Text size="sm" fw={600}>
                            {formatMetricValue(observation.originalValue, observation.originalUnit)}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {new Date(observation.observedAt).toLocaleString()} · original value ·{' '}
                            {sourceLabel(observation)}
                        </Text>
                    </div>
                    <Button
                        size="xs"
                        variant="default"
                        onClick={() => onToggleExcluded(observation)}
                    >
                        {observation.excluded ? 'Include' : 'Exclude outlier'}
                    </Button>
                </Group>
            ))}
        </Stack>
    )
}
