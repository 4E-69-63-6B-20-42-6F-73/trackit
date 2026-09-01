import { Alert, Badge, Button, Divider, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import type { JournalEvent, SleepStageDetail } from '../domain/types'
import { useServerData } from '../hooks/useServerData'
import { getJournalEntry } from '../lib/journalApi'
import { serverQueryKeys } from '../lib/serverQueries'

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

const nutrientFields = [
    ['protein', 'Protein', 'g'],
    ['carbs', 'Carbs', 'g'],
    ['fat', 'Fat', 'g'],
    ['fiber', 'Fiber', 'g'],
    ['sugar', 'Sugar', 'g'],
    ['saturatedFat', 'Saturated fat', 'g'],
    ['sodium', 'Sodium', 'mg'],
    ['potassium', 'Potassium', 'mg'],
] as const

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

function MealDetail({
    event,
    locale,
    timezone,
}: {
    event: JournalEvent
    locale?: string
    timezone: string
}) {
    if (event.detailView?.kind !== 'meal') return null
    const detail = event.detailView
    const number = (value: number, maximumFractionDigits = 1) =>
        new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)
    const serving = detail.serving
        ? detail.serving.unit === 'g'
            ? `${number(detail.serving.amount, 2)} g`
            : `${number(detail.serving.amount, 2)} ${detail.serving.amount === 1 ? 'serving' : 'servings'}`
        : 'Not recorded'
    const recordedAt = new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: timezone,
    }).format(new Date(event.observedAt))
    const nutrients = nutrientFields.filter(([key]) => typeof detail.nutrients[key] === 'number')

    return (
        <Stack gap="lg">
            <Group justify="space-between" align="flex-start">
                <div>
                    <Text size="xs" c="dimmed">
                        Meal
                    </Text>
                    <Text fw={700} size="xl">
                        {detail.mealType}
                    </Text>
                </div>
                {detail.nutritionQuality !== 'complete' && (
                    <Badge
                        variant="light"
                        color={detail.nutritionQuality === 'estimated' ? 'orange' : 'gray'}
                    >
                        {detail.nutritionQuality === 'estimated'
                            ? 'Estimated nutrition'
                            : 'Incomplete nutrition'}
                    </Badge>
                )}
            </Group>
            <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="md">
                <div>
                    <Text size="xs" c="dimmed">
                        Amount
                    </Text>
                    <Text fw={650}>{serving}</Text>
                </div>
                <div>
                    <Text size="xs" c="dimmed">
                        Energy
                    </Text>
                    <Text fw={650}>
                        {typeof detail.nutrients.calories === 'number'
                            ? `${number(detail.nutrients.calories)} kcal`
                            : 'Not recorded'}
                    </Text>
                </div>
                <div>
                    <Text size="xs" c="dimmed">
                        Date and time
                    </Text>
                    <Text fw={650}>{recordedAt}</Text>
                </div>
            </SimpleGrid>
            <div>
                <Text fw={650} mb="sm">
                    Nutrition
                </Text>
                {nutrients.length ? (
                    <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="md">
                        {nutrients.map(([key, label, unit]) => (
                            <div key={key}>
                                <Text size="xs" c="dimmed">
                                    {label}
                                </Text>
                                <Text fw={650}>
                                    {number(detail.nutrients[key])} {unit}
                                </Text>
                            </div>
                        ))}
                    </SimpleGrid>
                ) : (
                    <Text size="sm" c="dimmed">
                        No additional nutrition was recorded.
                    </Text>
                )}
            </div>
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
    const eventId = event?.id
    const detailQuery = useQuery({
        queryKey: [...serverQueryKeys.journal, 'detail', eventId ?? 'closed'],
        queryFn: ({ signal }) => getJournalEntry(eventId!, signal),
        enabled: Boolean(eventId),
    })
    const shownEvent = detailQuery.data ?? event
    const hasDetailedView =
        shownEvent?.detailView?.kind === 'meal' ||
        (shownEvent?.detailView?.kind === 'sleep' && shownEvent.detailView.stages.length > 0)
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
            title={shownEvent?.title}
            centered
            size={hasDetailedView ? 'lg' : 'md'}
        >
            {detailQuery.isFetching && (
                <Text size="xs" c="dimmed" mb="sm" role="status">
                    Loading latest entry details…
                </Text>
            )}
            {detailQuery.isError && (
                <Alert color="orange" mb="sm">
                    Detailed entry data could not be loaded. Showing the journal summary instead.
                </Alert>
            )}
            {shownEvent && hasDetailedView ? (
                <Stack gap="md">
                    {shownEvent.detailView?.kind === 'meal' ? (
                        <MealDetail event={shownEvent} locale={locale} timezone={timezone} />
                    ) : (
                        <SleepDetail event={shownEvent} locale={locale} timezone={timezone} />
                    )}
                    <Divider />
                    <Group justify="space-between" align="flex-end">
                        <Group gap="xl">
                            <div>
                                <Text size="xs" c="dimmed">
                                    Source
                                </Text>
                                <Text size="sm" fw={600}>
                                    {shownEvent.source}
                                </Text>
                            </div>
                            {shownEvent.deviceName && (
                                <div>
                                    <Text size="xs" c="dimmed">
                                        Device
                                    </Text>
                                    <Text size="sm" fw={600}>
                                        {shownEvent.deviceName}
                                    </Text>
                                </div>
                            )}
                        </Group>
                        <Button variant="default" onClick={onClose}>
                            Close
                        </Button>
                    </Group>
                </Stack>
            ) : shownEvent ? (
                <Stack gap="md">
                    <div>
                        <Text fw={700} size="xl">
                            {shownEvent.detail}
                        </Text>
                        <Text size="sm" c="dimmed" mt={4}>
                            {shownEvent.startedAt &&
                            shownEvent.endedAt &&
                            shownEvent.startedAt !== shownEvent.endedAt
                                ? `${formatDateTime(shownEvent.startedAt)} – ${formatTime(shownEvent.endedAt)}`
                                : formatDateTime(shownEvent.observedAt)}
                        </Text>
                    </div>
                    <Divider />
                    <div>
                        <Text size="xs" c="dimmed">
                            Source
                        </Text>
                        <Text size="sm" fw={600}>
                            {shownEvent.source}
                        </Text>
                    </div>
                    {shownEvent.deviceName && (
                        <div>
                            <Text size="xs" c="dimmed">
                                Device
                            </Text>
                            <Text size="sm" fw={600}>
                                {shownEvent.deviceName}
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
