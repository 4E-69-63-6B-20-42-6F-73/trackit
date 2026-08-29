import { Badge, Button, Divider, Group, Modal, Stack, Text } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { useState } from 'react'
import type { JournalEvent, SleepStageDetail } from '../domain/types'

const stageLabels: Record<SleepStageDetail['type'], string> = {
    awake: 'Awake',
    rem: 'REM',
    light: 'Light',
    deep: 'Deep',
    unknown: 'Unknown',
}

const stageTone: Record<SleepStageDetail['type'], string> = {
    awake: 'var(--mantine-color-gray-4)',
    rem: 'var(--mantine-color-violet-5)',
    light: 'var(--mantine-color-blue-4)',
    deep: 'var(--mantine-color-indigo-7)',
    unknown: 'var(--mantine-color-gray-5)',
}

const formatDateTime = (value?: string) =>
    value
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : null

const formatTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
        new Date(value),
    )

const durationMinutes = (start: string, end: string) =>
    Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))

function SleepDetail({ event }: { event: JournalEvent }) {
    const stages = event.detailView?.kind === 'sleep' ? event.detailView.stages : []
    const start = event.startedAt
        ? new Date(event.startedAt).getTime()
        : Math.min(...stages.map(stage => new Date(stage.start).getTime()))
    const end = event.endedAt
        ? new Date(event.endedAt).getTime()
        : Math.max(...stages.map(stage => new Date(stage.end).getTime()))
    const duration = Math.max(1, end - start)
    const totals = new Map<SleepStageDetail['type'], number>()
    for (const stage of stages)
        totals.set(
            stage.type,
            (totals.get(stage.type) ?? 0) + durationMinutes(stage.start, stage.end),
        )

    return (
        <Stack gap="lg">
            <div>
                <Text fw={700} size="xl">
                    Sleep phases
                </Text>
                {event.startedAt && event.endedAt && (
                    <Text size="sm" c="dimmed">
                        {formatTime(event.startedAt)} – {formatTime(event.endedAt)}
                    </Text>
                )}
            </div>
            <Stack gap="xs">
                {(['awake', 'rem', 'light', 'deep'] as const).map(type => (
                    <div
                        key={type}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '54px 1fr',
                            gap: 10,
                            alignItems: 'center',
                        }}
                    >
                        <Text size="xs" c="dimmed">
                            {stageLabels[type]}
                        </Text>
                        <div
                            style={{
                                position: 'relative',
                                height: 22,
                                borderRadius: 7,
                                background: 'var(--line)',
                                overflow: 'hidden',
                            }}
                        >
                            {stages
                                .filter(stage => stage.type === type)
                                .map((stage, index) => {
                                    const left =
                                        ((new Date(stage.start).getTime() - start) / duration) * 100
                                    const width =
                                        ((new Date(stage.end).getTime() -
                                            new Date(stage.start).getTime()) /
                                            duration) *
                                        100
                                    return (
                                        <div
                                            key={`${stage.start}-${stage.end}-${index}`}
                                            title={`${stageLabels[type]} · ${formatTime(stage.start)}–${formatTime(stage.end)} · ${durationMinutes(stage.start, stage.end)} min`}
                                            style={{
                                                position: 'absolute',
                                                left: `${left}%`,
                                                width: `${Math.max(width, 0.6)}%`,
                                                top: 0,
                                                bottom: 0,
                                                background: stageTone[type],
                                                borderRadius: 6,
                                            }}
                                        />
                                    )
                                })}
                        </div>
                    </div>
                ))}
            </Stack>
            <Group gap="xs">
                {(['awake', 'rem', 'light', 'deep'] as const).map(type => {
                    const minutes = totals.get(type) ?? 0
                    if (!minutes) return null
                    return (
                        <Badge key={type} variant="light">
                            {stageLabels[type]} · {minutes} min
                        </Badge>
                    )
                })}
            </Group>
        </Stack>
    )
}

export function JournalEntryDetailModal({
    event,
    onClose,
}: {
    event: JournalEvent | null
    onClose: () => void
}) {
    const [detailed, setDetailed] = useState(false)
    const hasDetailedView =
        event?.detailView?.kind === 'sleep' && event.detailView.stages.length > 0

    return (
        <Modal
            opened={Boolean(event)}
            onClose={() => {
                setDetailed(false)
                onClose()
            }}
            title={detailed ? undefined : event?.title}
            centered
            size={detailed ? 'lg' : 'md'}
        >
            {event && detailed && hasDetailedView ? (
                <Stack gap="md">
                    <Button
                        variant="subtle"
                        color="gray"
                        size="compact-sm"
                        leftSection={<IconArrowLeft size={16} />}
                        onClick={() => setDetailed(false)}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Back to entry
                    </Button>
                    <SleepDetail event={event} />
                </Stack>
            ) : event ? (
                <Stack gap="md">
                    <div>
                        <Text fw={700} size="xl">
                            {event.detail}
                        </Text>
                        <Text size="sm" c="dimmed" mt={4}>
                            {event.startedAt && event.endedAt && event.startedAt !== event.endedAt
                                ? `${formatDateTime(event.startedAt)} – ${formatTime(event.endedAt)}`
                                : formatDateTime(event.observedAt)}
                        </Text>
                    </div>
                    <Divider />
                    <div>
                        <Text size="xs" c="dimmed">
                            Source
                        </Text>
                        <Text size="sm" fw={600}>
                            {event.source}
                        </Text>
                    </div>
                    {event.deviceName && (
                        <div>
                            <Text size="xs" c="dimmed">
                                Device
                            </Text>
                            <Text size="sm" fw={600}>
                                {event.deviceName}
                            </Text>
                        </div>
                    )}
                    {hasDetailedView && (
                        <Button variant="light" color="trackit" onClick={() => setDetailed(true)}>
                            View detailed sleep
                        </Button>
                    )}
                </Stack>
            ) : null}
        </Modal>
    )
}
