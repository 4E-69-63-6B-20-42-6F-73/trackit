import { Badge, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { IconArrowUpRight } from '@tabler/icons-react'
import type { IconMoon } from '@tabler/icons-react'
import { useState } from 'react'
import type { NumericObservation } from '../domain/health'
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
    onViewTrend,
    locale,
    timezone,
}: {
    icon: typeof IconMoon
    label: string
    value: string
    note?: string | null
    delta?: string
    tone: string
    action?: {
        label: string
        onClick: () => void
    }
    record?: NumericObservation | null
    onViewTrend?: () => void
    locale?: string
    timezone?: string
}) {
    const [detailsOpen, setDetailsOpen] = useState(false)
    return (
        <>
            <article
                className={`metric-card${record ? ' metric-card-clickable' : ''}`}
                onClick={record ? () => setDetailsOpen(true) : undefined}
                onKeyDown={
                    record
                        ? event => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setDetailsOpen(true)
                              }
                          }
                        : undefined
                }
                role={record ? 'button' : undefined}
                tabIndex={record ? 0 : undefined}
                aria-label={record ? `View ${label} details` : undefined}
            >
                <div className={`metric-icon ${tone}`}>
                    <Icon size={19} stroke={1.8} />
                </div>
                <div className="metric-top">
                    <Text size="sm" fw={650}>
                        {label}
                    </Text>
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
                        onClick={event => {
                            event.stopPropagation()
                            action.onClick()
                        }}
                        variant="subtle"
                        color="trackit"
                        size="compact-sm"
                    >
                        {action.label}
                    </Button>
                ) : (
                    <Text className="metric-value">{value}</Text>
                )}
                {note && <Text className="metric-note">{note}</Text>}
            </article>
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
                            <Text size="sm">
                                {new Date(record.observedAt).toLocaleString(locale, {
                                    timeZone: timezone,
                                })}
                            </Text>
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
                        <Group justify="space-between">
                            {onViewTrend ? (
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    onClick={() => {
                                        setDetailsOpen(false)
                                        onViewTrend()
                                    }}
                                >
                                    View trend
                                </Button>
                            ) : (
                                <span />
                            )}
                            <Button variant="default" onClick={() => setDetailsOpen(false)}>
                                Close
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>
        </>
    )
}
