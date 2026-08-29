import { Badge, Button, Divider, Group, Modal, Stack, Text } from '@mantine/core'
import type { JournalEvent, SleepStageDetail } from '../domain/types'
import { useServerData } from '../hooks/useServerData'

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

const durationMinutes = (start: string, end: string) =>
    Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))

function SleepDetail({
    event,
    locale,
    timezone,
}: {
    event: JournalEvent
    locale?: string
    timezone: string
}) {
    const stages = event.detailView?.kind === 'sleep' ? event.detailView.stages : []
    const formatTime = (value: string) =>
        new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
        }).format(new Date(value))
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
    const { preferences } = useServerData()
    const locale = preferences?.locale
    const timezone = preferences?.timezone ?? 'UTC'
    const hasDetailedView =
        event?.detailView?.kind === 'sleep' && event.detailView.stages.length > 0
    const formatDateTime = (value?: string) =>
        value
            ? new Intl.DateTimeFormat(locale, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: timezone,
              }).format(new Date(value))
            : null
    const formatTime = (value: string) =>
        new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
        }).format(new Date(value))

    return (
        <Modal
            opened={Boolean(event)}
            onClose={onClose}
            title={event?.title}
            centered
            size={hasDetailedView ? 'lg' : 'md'}
        >
            {event && hasDetailedView ? (
                <Stack gap="md">
                    <SleepDetail event={event} locale={locale} timezone={timezone} />
                    <Divider />
                    <Group justify="space-between" align="flex-end">
                        <Group gap="xl">
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
                        </Group>
                        <Button variant="default" onClick={onClose}>
                            Close
                        </Button>
                    </Group>
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
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>
                            Close
                        </Button>
                    </Group>
                </Stack>
            ) : null}
        </Modal>
    )
}
