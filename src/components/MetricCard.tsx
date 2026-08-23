import { Badge, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconArrowUpRight } from '@tabler/icons-react'
import type { IconMoon } from '@tabler/icons-react'
import { useState } from 'react'
import type { Observation } from '../domain/health'
import { friendlySourceName } from '../domain/formatting'

export function MetricCard({
    icon: Icon,
    label,
    value,
    note,
    delta,
    tone,
    action,
    record,
}: {
    icon: typeof IconMoon
    label: string
    value: string
    note: string
    delta?: string
    tone: string
    action?: {
        label: string
        onClick: () => void
    }
    record?: Observation | null
}) {
    const [detailsOpen, setDetailsOpen] = useState(false)
    return (
        <article className="metric-card">
            <div className={`metric-icon ${tone}`}>
                <Icon size={19} stroke={1.8} />
            </div>
            <div className="metric-top">
                <Text className="eyebrow">{label}</Text>
                {delta && (
                    <Badge
                        variant="light"
                        color="trackit"
                        size="sm"
                        leftSection={<IconArrowUpRight size={11} />}
                    >
                        {delta}
                    </Badge>
                )}
            </div>
            {action ? (
                <Button
                    className="metric-action"
                    onClick={action.onClick}
                    variant="subtle"
                    color="trackit"
                    size="compact-sm"
                >
                    {action.label}
                </Button>
            ) : (
                <Text className="metric-value">{value}</Text>
            )}
            <Text className="metric-note">{note}</Text>
            {record && (
                <Button
                    className="metric-detail-action"
                    variant="subtle"
                    color="gray"
                    size="compact-xs"
                    onClick={() => setDetailsOpen(true)}
                >
                    View details
                </Button>
            )}
            <Modal
                opened={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                title={label}
                size="sm"
            >
                {record && (
                    <Stack gap="sm">
                        <div>
                            <Text size="xs" c="dimmed">
                                Recorded
                            </Text>
                            <Text size="sm">{new Date(record.observedAt).toLocaleString()}</Text>
                        </div>
                        <div>
                            <Text size="xs" c="dimmed">
                                Source
                            </Text>
                            <Text size="sm">
                                {friendlySourceName(
                                    typeof record.metadata?.dataOrigin === 'string'
                                        ? record.metadata.dataOrigin
                                        : record.sourceId
                                          ? `Source ${record.sourceId}`
                                          : 'Manually entered',
                                )}
                            </Text>
                        </div>
                        <div>
                            <Text size="xs" c="dimmed">
                                Value
                            </Text>
                            <Text size="sm">
                                {record.originalValue} {record.originalUnit}
                            </Text>
                        </div>
                        {record.metadata?.recordType !== undefined && (
                            <div>
                                <Text size="xs" c="dimmed">
                                    Record type
                                </Text>
                                <Text size="sm">
                                    {String(record.metadata.recordType).replaceAll('_', ' ')}
                                </Text>
                            </div>
                        )}
                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setDetailsOpen(false)}>
                                Close
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </article>
    )
}
