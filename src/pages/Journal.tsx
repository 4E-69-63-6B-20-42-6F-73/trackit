import { useEffect, useMemo, useState } from 'react'
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Loader,
    Menu,
    Modal,
    Popover,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import {
    IconChevronLeft,
    IconChevronRight,
    IconDots,
    IconFilter,
    IconPlus,
    IconSearch,
    IconX,
} from '@tabler/icons-react'
import { useSearchParams } from 'react-router-dom'
import { JournalEventList } from '../components/JournalEventList'
import { JournalMealEditModal } from '../components/JournalMealEditModal'
import { JournalPageSkeleton } from '../components/LoadingSkeletons'
import { PageHeader } from '../components/PageHeader'
import { SyncStatus } from '../components/SyncStatus'
import {
    addCalendarDays,
    calendarDateKey,
    calendarDayRangeForKey,
    calendarTodayKey,
    formatCalendarDate,
} from '@trackit/domain/calendar'
import type { Category, JournalEvent } from '@trackit/domain/types'
import { useJournal } from '../hooks/useJournal'
import { useServerData } from '../hooks/useServerData'
import { getJournalEntry } from '../lib/journalApi'
import { serverQueryKeys } from '../lib/serverQueries'

const categories = ['All', 'Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins'] as const
const isMealEdit = (event: JournalEvent | null) =>
    Boolean(event && (event.definitionId === 'meal' || event.detailView?.kind === 'meal'))

export function Journal({
    remove,
    update,
    commandPending = false,
}: {
    remove: (id: string) => void
    update: (event: JournalEvent, changes: { title: string; detail: string }) => Promise<boolean>
    commandPending?: boolean
}) {
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const locale = preferences?.locale
    const todayKey = calendarTodayKey(timezone)
    const [params, setParams] = useSearchParams()
    const [category, setCategory] = useState<'All' | Category>(
        (params.get('category') as Category | null) ?? 'All',
    )
    const [query, setQuery] = useState(params.get('q') ?? '')
    const [source, setSource] = useState<string | null>(params.get('source'))
    const [device, setDevice] = useState<string | null>(params.get('device'))
    const [selectedDate, setSelectedDate] = useState<string | null>(params.get('date'))
    const [rangeFrom, setRangeFrom] = useState(params.get('from') ?? '')
    const [rangeTo, setRangeTo] = useState(params.get('to') ?? '')
    const [editing, setEditing] = useState<JournalEvent | null>(null)
    const [deleting, setDeleting] = useState<JournalEvent | null>(null)
    const [draftTitle, setDraftTitle] = useState('')
    const [draftDetail, setDraftDetail] = useState('')
    const mealEditQuery = useQuery({
        queryKey: [...serverQueryKeys.journal, 'detail', editing?.id ?? 'closed'],
        queryFn: ({ signal }) => getJournalEntry(editing!.id, signal),
        enabled: Boolean(editing && isMealEdit(editing)),
    })

    const selectedRange = selectedDate ? calendarDayRangeForKey(selectedDate, timezone) : null
    const from = selectedRange
        ? selectedRange.from.toISOString()
        : rangeFrom
          ? calendarDayRangeForKey(rangeFrom, timezone).from.toISOString()
          : undefined
    const to = selectedRange
        ? selectedRange.to.toISOString()
        : rangeTo
          ? calendarDayRangeForKey(rangeTo, timezone).to.toISOString()
          : undefined
    const {
        events: availableEvents,
        status,
        syncFailure,
        retry,
        hasOlder,
        loadingOlder,
        loadOlder,
    } = useJournal({
        from,
        to,
        category: category === 'All' ? undefined : category,
        limit: 100,
    })

    useEffect(() => {
        const next = new URLSearchParams()
        if (selectedDate) next.set('date', selectedDate)
        if (!selectedDate && rangeFrom) next.set('from', rangeFrom)
        if (!selectedDate && rangeTo) next.set('to', rangeTo)
        if (category !== 'All') next.set('category', category)
        if (query) next.set('q', query)
        if (source) next.set('source', source)
        if (device) next.set('device', device)
        setParams(next, { replace: true })
    }, [category, device, query, rangeFrom, rangeTo, selectedDate, setParams, source])

    const shown = useMemo(
        () =>
            availableEvents.filter(event => {
                const eventKey = calendarDateKey(new Date(event.observedAt), timezone)
                return (
                    (!selectedDate || eventKey === selectedDate) &&
                    (selectedDate || !rangeFrom || eventKey >= rangeFrom) &&
                    (selectedDate || !rangeTo || eventKey <= rangeTo) &&
                    (category === 'All' || event.category === category) &&
                    (!source || event.source === source) &&
                    (!device || event.deviceName === device) &&
                    `${event.title} ${event.detail} ${event.source}`
                        .toLowerCase()
                        .includes(query.toLowerCase())
                )
            }),
        [
            availableEvents,
            category,
            device,
            query,
            rangeFrom,
            rangeTo,
            selectedDate,
            source,
            timezone,
        ],
    )
    const sources = useMemo(
        () => [...new Set(availableEvents.map(event => event.source))].sort(),
        [availableEvents],
    )
    const devices = useMemo(
        () => [...new Set(availableEvents.flatMap(event => event.deviceName ?? []))].sort(),
        [availableEvents],
    )
    const groups = useMemo(() => {
        const yesterdayKey = addCalendarDays(todayKey, -1)
        return Array.from(
            shown.reduce((result, event) => {
                const key = calendarDateKey(new Date(event.observedAt), timezone)
                const existing = result.get(key)
                if (existing) existing.events.push(event)
                else {
                    const label =
                        key === todayKey
                            ? 'Today'
                            : key === yesterdayKey
                              ? 'Yesterday'
                              : formatCalendarDate(key, locale, {
                                    weekday: 'long',
                                    month: 'short',
                                    day: 'numeric',
                                })
                    result.set(key, { key, label, events: [event] })
                }
                return result
            }, new Map<string, { key: string; label: string; events: JournalEvent[] }>()),
        ).map(([, group]) => group)
    }, [locale, shown, timezone, todayKey])

    const detailedEditing =
        editing && isMealEdit(editing) && mealEditQuery.data?.id === editing.id
            ? mealEditQuery.data
            : editing

    const beginEdit = (event: JournalEvent) => {
        setEditing(event)
        if (!isMealEdit(event)) {
            setDraftTitle(event.title)
            setDraftDetail(event.detail)
        }
    }
    const closeEditing = () => setEditing(null)
    const moveDay = (days: number) => {
        const current = selectedDate ?? todayKey
        const next = addCalendarDays(current, days)
        setSelectedDate(next > todayKey ? todayKey : next)
    }
    const showEarlier = () => {
        if (selectedDate) {
            setRangeFrom(addCalendarDays(selectedDate, -6))
            setRangeTo(selectedDate)
            setSelectedDate(null)
            return
        }
        if (rangeFrom) setRangeFrom(addCalendarDays(rangeFrom, -7))
    }
    const clearFilters = () => {
        setCategory('All')
        setSelectedDate(null)
        setRangeFrom('')
        setRangeTo('')
        setSource(null)
        setDevice(null)
    }
    const activeFilterCount =
        Number(category !== 'All') +
        Number(Boolean(selectedDate || rangeFrom || rangeTo)) +
        Number(Boolean(source)) +
        Number(Boolean(device))

    if (status === 'connecting' && availableEvents.length === 0) return <JournalPageSkeleton />

    return (
        <div className="page-content journal-page">
            <PageHeader
                title="Journal"
                description="Your observations in chronological order, with their recorded source and detail intact."
            />
            {syncFailure && <SyncStatus message={syncFailure} retry={retry} />}
            <div className="journal-toolbar">
                <TextInput
                    className="journal-search"
                    value={query}
                    onChange={event => setQuery(event.currentTarget.value)}
                    placeholder="Search journal"
                    aria-label="Search journal"
                    leftSection={<IconSearch size={16} />}
                />
                <Popover width={460} position="bottom-end" shadow="md">
                    <Popover.Target>
                        <Button variant="default" leftSection={<IconFilter size={16} />}>
                            Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
                        </Button>
                    </Popover.Target>
                    <Popover.Dropdown>
                        <Stack gap="md">
                            <Select
                                label="Category"
                                value={category}
                                onChange={value =>
                                    setCategory((value as 'All' | Category) ?? 'All')
                                }
                                data={categories.map(value => ({
                                    value,
                                    label: value === 'All' ? 'All categories' : value,
                                }))}
                            />
                            <SegmentedControl
                                aria-label="Journal time range"
                                value={
                                    selectedDate ? 'day' : rangeFrom || rangeTo ? 'range' : 'all'
                                }
                                onChange={value => {
                                    if (value === 'day') {
                                        setSelectedDate(todayKey)
                                        setRangeFrom('')
                                        setRangeTo('')
                                    } else if (value === 'range') {
                                        setSelectedDate(null)
                                        setRangeFrom(
                                            current => current || addCalendarDays(todayKey, -6),
                                        )
                                        setRangeTo(current => current || todayKey)
                                    } else {
                                        setSelectedDate(null)
                                        setRangeFrom('')
                                        setRangeTo('')
                                    }
                                }}
                                data={[
                                    { label: 'All time', value: 'all' },
                                    { label: 'One day', value: 'day' },
                                    { label: 'Range', value: 'range' },
                                ]}
                            />
                            {selectedDate && (
                                <Group gap="xs" wrap="nowrap">
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label="Previous day"
                                        onClick={() => moveDay(-1)}
                                    >
                                        <IconChevronLeft size={18} />
                                    </ActionIcon>
                                    <TextInput
                                        type="date"
                                        aria-label="Journal date"
                                        value={selectedDate}
                                        max={todayKey}
                                        onChange={event =>
                                            event.currentTarget.value &&
                                            setSelectedDate(event.currentTarget.value)
                                        }
                                        style={{ flex: 1 }}
                                    />
                                    <ActionIcon
                                        variant="subtle"
                                        color="gray"
                                        aria-label="Next day"
                                        disabled={selectedDate === todayKey}
                                        onClick={() => moveDay(1)}
                                    >
                                        <IconChevronRight size={18} />
                                    </ActionIcon>
                                </Group>
                            )}
                            {!selectedDate && (rangeFrom || rangeTo) && (
                                <Group grow align="end">
                                    <TextInput
                                        type="date"
                                        label="From"
                                        value={rangeFrom}
                                        max={rangeTo || todayKey}
                                        onChange={event => setRangeFrom(event.currentTarget.value)}
                                    />
                                    <TextInput
                                        type="date"
                                        label="Through"
                                        value={rangeTo}
                                        min={rangeFrom || undefined}
                                        max={todayKey}
                                        onChange={event => setRangeTo(event.currentTarget.value)}
                                    />
                                </Group>
                            )}
                            <Select
                                clearable
                                searchable
                                value={source}
                                onChange={setSource}
                                label="Source"
                                placeholder="All sources"
                                data={sources}
                            />
                            {devices.length > 0 && (
                                <Select
                                    clearable
                                    searchable
                                    value={device}
                                    onChange={setDevice}
                                    label="Device"
                                    placeholder="All devices"
                                    data={devices}
                                />
                            )}
                            <Button
                                variant="subtle"
                                color="gray"
                                disabled={!activeFilterCount}
                                onClick={clearFilters}
                            >
                                Clear filters
                            </Button>
                        </Stack>
                    </Popover.Dropdown>
                </Popover>
            </div>

            {activeFilterCount > 0 && (
                <Group gap="xs" mb="md" aria-label="Active Journal filters">
                    {category !== 'All' && (
                        <Button
                            size="compact-xs"
                            variant="light"
                            rightSection={<IconX size={12} />}
                            onClick={() => setCategory('All')}
                        >
                            {category}
                        </Button>
                    )}
                    {selectedDate && (
                        <Button
                            size="compact-xs"
                            variant="light"
                            rightSection={<IconX size={12} />}
                            onClick={() => setSelectedDate(null)}
                        >
                            {formatCalendarDate(selectedDate, locale, {
                                month: 'short',
                                day: 'numeric',
                            })}
                        </Button>
                    )}
                    {!selectedDate && (rangeFrom || rangeTo) && (
                        <Button
                            size="compact-xs"
                            variant="light"
                            rightSection={<IconX size={12} />}
                            onClick={() => {
                                setRangeFrom('')
                                setRangeTo('')
                            }}
                        >
                            {rangeFrom || '…'} – {rangeTo || '…'}
                        </Button>
                    )}
                    {source && (
                        <Button
                            size="compact-xs"
                            variant="light"
                            rightSection={<IconX size={12} />}
                            onClick={() => setSource(null)}
                        >
                            {source}
                        </Button>
                    )}
                    {device && (
                        <Button
                            size="compact-xs"
                            variant="light"
                            rightSection={<IconX size={12} />}
                            onClick={() => setDevice(null)}
                        >
                            {device}
                        </Button>
                    )}
                </Group>
            )}

            <section className="panel timeline journal-timeline">
                {groups.map(group => (
                    <div key={group.key}>
                        <div className="day-divider">
                            <span>{group.label}</span>
                        </div>
                        <JournalEventList
                            events={group.events}
                            roomy
                            renderActions={event => (
                                <Menu>
                                    <Menu.Target>
                                        <ActionIcon
                                            aria-label={`Actions for ${event.title}`}
                                            variant="subtle"
                                            color="gray"
                                        >
                                            <IconDots size={18} />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        {event.source === 'You' && (
                                            <>
                                                <Menu.Item
                                                    disabled={mealEditQuery.isFetching}
                                                    onClick={() => beginEdit(event)}
                                                >
                                                    Edit
                                                </Menu.Item>
                                                <Menu.Item
                                                    disabled={commandPending}
                                                    onClick={() => setDeleting(event)}
                                                    color="red"
                                                >
                                                    Delete
                                                </Menu.Item>
                                            </>
                                        )}
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                        />
                    </div>
                ))}
                {shown.length === 0 && availableEvents.length > 0 && (
                    <div className="empty-state">
                        <IconSearch size={24} />
                        <Text fw={600}>Nothing matches</Text>
                        <Text size="sm" c="dimmed">
                            Change the search or clear a filter to see your timeline again.
                        </Text>
                        <Button variant="subtle" onClick={clearFilters}>
                            Clear filters
                        </Button>
                    </div>
                )}
                {availableEvents.length === 0 && !syncFailure && (
                    <div className="empty-state">
                        <IconPlus size={24} />
                        <Text fw={600}>Your journal is ready</Text>
                        <Text size="sm" c="dimmed">
                            Meals, measurements, check-ins, and synced activity will appear here.
                            Use Log to record your first entry.
                        </Text>
                    </div>
                )}
                {(selectedDate || rangeFrom || rangeTo) && (
                    <div className="journal-load-more">
                        <Button variant="subtle" color="gray" onClick={showEarlier}>
                            Show earlier
                        </Button>
                    </div>
                )}
                {hasOlder && !selectedDate && !rangeFrom && !rangeTo && (
                    <div className="journal-load-more">
                        <Button variant="default" loading={loadingOlder} onClick={loadOlder}>
                            Load older entries
                        </Button>
                    </div>
                )}
            </section>

            <Modal
                opened={Boolean(editing && isMealEdit(editing) && mealEditQuery.isPending)}
                onClose={closeEditing}
                title="Loading meal"
                centered
                size="sm"
            >
                <Group justify="center" py="lg" role="status" aria-label="Loading meal details">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                        Loading the latest meal details…
                    </Text>
                </Group>
            </Modal>
            <Modal
                opened={Boolean(editing && isMealEdit(editing) && mealEditQuery.isError)}
                onClose={closeEditing}
                title="Meal unavailable"
                centered
                size="sm"
            >
                <Stack>
                    <Alert color="orange">
                        The latest meal details could not be loaded. Try again before editing.
                    </Alert>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={closeEditing}>
                            Cancel
                        </Button>
                        <Button
                            loading={mealEditQuery.isFetching}
                            onClick={() => void mealEditQuery.refetch()}
                        >
                            Retry
                        </Button>
                    </Group>
                </Stack>
            </Modal>
            <JournalMealEditModal
                event={
                    detailedEditing?.detailView?.kind === 'meal' && mealEditQuery.isSuccess
                        ? detailedEditing
                        : null
                }
                onClose={closeEditing}
                onSaved={closeEditing}
            />
            <Modal
                opened={Boolean(editing && !isMealEdit(editing))}
                onClose={closeEditing}
                title="Edit entry"
                centered
            >
                <TextInput
                    label="Title"
                    value={draftTitle}
                    onChange={event => setDraftTitle(event.currentTarget.value)}
                />
                <TextInput
                    mt="md"
                    label="Details"
                    value={draftDetail}
                    onChange={event => setDraftDetail(event.currentTarget.value)}
                />
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" disabled={commandPending} onClick={closeEditing}>
                        Cancel
                    </Button>
                    <Button
                        loading={commandPending}
                        disabled={!draftTitle.trim()}
                        onClick={async () => {
                            if (!editing) return
                            if (await update(editing, { title: draftTitle, detail: draftDetail }))
                                closeEditing()
                        }}
                    >
                        Save changes
                    </Button>
                </Group>
            </Modal>
            <Modal
                opened={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title="Delete this entry?"
                centered
                size="sm"
            >
                <Text size="sm">
                    This removes {deleting?.title} from your observations and any summaries derived
                    from it.
                </Text>
                <Group justify="flex-end" mt="lg">
                    <Button
                        variant="default"
                        disabled={commandPending}
                        onClick={() => setDeleting(null)}
                    >
                        Keep entry
                    </Button>
                    <Button
                        color="red"
                        loading={commandPending}
                        onClick={() => {
                            if (deleting) remove(deleting.id)
                            setDeleting(null)
                        }}
                    >
                        Delete entry
                    </Button>
                </Group>
            </Modal>
        </div>
    )
}
