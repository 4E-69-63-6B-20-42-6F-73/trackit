import { useEffect, useMemo, useState } from 'react'
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Menu,
    Modal,
    SegmentedControl,
    Text,
    TextInput,
    Select,
} from '@mantine/core'
import {
    IconDots,
    IconChevronLeft,
    IconChevronRight,
    IconPlus,
    IconSearch,
} from '@tabler/icons-react'
import { eventVisual } from '../domain/data'
import { PageHeader } from '../components/PageHeader'
import type { Category, JournalEvent } from '../domain/types'
import { useSearchParams } from 'react-router-dom'
import { listJournal } from '../lib/journalApi'

const localDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function Journal({
    events,
    remove,
    duplicate,
    update,
    onSelectedDateChange,
    hasOlder = false,
    loadingOlder = false,
    loadOlder,
    initialSelectedDate,
}: {
    events: JournalEvent[]
    remove: (id: string) => void
    duplicate: (event: JournalEvent) => void
    update: (
        event: JournalEvent,
        changes: Pick<JournalEvent, 'title' | 'detail' | 'time'>,
    ) => Promise<boolean>
    onSelectedDateChange?: (date: string | null) => void
    hasOlder?: boolean
    loadingOlder?: boolean
    loadOlder?: () => Promise<void>
    initialSelectedDate?: string | null
}) {
    const [params, setParams] = useSearchParams()
    const initialCategory = params.get('category') as Category | null
    const [filter, setFilter] = useState<'All' | Category>(initialCategory ?? 'All')
    const [query, setQuery] = useState(params.get('q') ?? '')
    const [source, setSource] = useState<string | null>(params.get('source'))
    const [device, setDevice] = useState<string | null>(params.get('device'))
    const [selectedDate, setSelectedDate] = useState<string | null>(
        params.get('date') ?? initialSelectedDate ?? null,
    )
    const [rangeFrom, setRangeFrom] = useState(params.get('from') ?? '')
    const [rangeTo, setRangeTo] = useState(params.get('to') ?? '')
    const [boundedEvents, setBoundedEvents] = useState<JournalEvent[] | null>(null)
    const [editing, setEditing] = useState<JournalEvent | null>(null)
    const [deleting, setDeleting] = useState<JournalEvent | null>(null)
    const [draftTitle, setDraftTitle] = useState('')
    const [draftDetail, setDraftDetail] = useState('')
    useEffect(() => onSelectedDateChange?.(selectedDate), [onSelectedDateChange, selectedDate])
    useEffect(() => {
        if (!selectedDate && !rangeFrom && !rangeTo) {
            return
        }
        let active = true
        const fromKey = selectedDate || rangeFrom
        const toKey = selectedDate || rangeTo
        const from = fromKey ? new Date(`${fromKey}T00:00:00`).toISOString() : undefined
        const toDate = toKey ? new Date(`${toKey}T00:00:00`) : null
        if (toDate) toDate.setDate(toDate.getDate() + 1)
        void listJournal({
            from,
            to: toDate?.toISOString(),
            category: filter === 'All' ? undefined : filter,
            limit: 100,
        })
            .then(records => active && setBoundedEvents(records))
            .catch(() => active && setBoundedEvents(null))
        return () => {
            active = false
        }
    }, [filter, rangeFrom, rangeTo, selectedDate])
    useEffect(() => {
        const next = new URLSearchParams()
        if (selectedDate) next.set('date', selectedDate)
        if (!selectedDate && rangeFrom) next.set('from', rangeFrom)
        if (!selectedDate && rangeTo) next.set('to', rangeTo)
        if (filter !== 'All') next.set('category', filter)
        if (query) next.set('q', query)
        if (source) next.set('source', source)
        if (device) next.set('device', device)
        setParams(next, { replace: true })
    }, [device, filter, query, rangeFrom, rangeTo, selectedDate, setParams, source])
    const availableEvents = useMemo(
        () => (!selectedDate && !rangeFrom && !rangeTo ? events : (boundedEvents ?? events)),
        [boundedEvents, events, rangeFrom, rangeTo, selectedDate],
    )
    const shown = useMemo(
        () =>
            availableEvents.filter(
                event =>
                    (!selectedDate ||
                        localDateKey(new Date(event.observedAt ?? 0)) === selectedDate) &&
                    (selectedDate ||
                        !rangeFrom ||
                        localDateKey(new Date(event.observedAt ?? 0)) >= rangeFrom) &&
                    (selectedDate ||
                        !rangeTo ||
                        localDateKey(new Date(event.observedAt ?? 0)) <= rangeTo) &&
                    (filter === 'All' || event.category === filter) &&
                    (!source || event.source === source) &&
                    (!device || event.deviceName === device) &&
                    `${event.title} ${event.detail} ${event.source}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
            ),
        [availableEvents, device, filter, query, rangeFrom, rangeTo, selectedDate, source],
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
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(today.getDate() - 1)
        const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
        return Array.from(
            shown.reduce((result, event) => {
                const date = event.observedAt ? new Date(event.observedAt) : today
                const key = dayKey(date)
                const existing = result.get(key)
                if (existing) existing.events.push(event)
                else {
                    const label =
                        key === dayKey(today)
                            ? 'Today'
                            : key === dayKey(yesterday)
                              ? 'Yesterday'
                              : new Intl.DateTimeFormat(undefined, {
                                    weekday: 'long',
                                    month: 'short',
                                    day: 'numeric',
                                }).format(date)
                    result.set(key, { label, events: [event] })
                }
                return result
            }, new Map<string, { label: string; events: JournalEvent[] }>()),
        ).map(([, group]) => ({
            ...group,
            events: group.events.reduce<JournalEvent[]>((result, event, index, all) => {
                if (event.title !== 'Weight' && event.title !== 'Body fat')
                    return [...result, event]
                const partnerTitle = event.title === 'Weight' ? 'Body fat' : 'Weight'
                const partner = all.find(
                    candidate =>
                        candidate.title === partnerTitle &&
                        candidate.source === event.source &&
                        Math.abs(
                            new Date(candidate.observedAt ?? 0).getTime() -
                                new Date(event.observedAt ?? 0).getTime(),
                        ) <= 60_000,
                )
                if (!partner) return [...result, event]
                if (
                    result.some(
                        candidate => candidate.id === partner.id || candidate.id === event.id,
                    )
                )
                    return result
                return [
                    ...result,
                    {
                        ...event,
                        id: `${event.id}:${partner.id}`,
                        title: 'Body composition',
                        detail: [event, partner]
                            .sort(item => (item.title === 'Weight' ? -1 : 1))
                            .map(item => item.detail)
                            .join(' · '),
                    },
                ]
            }, []),
        }))
    }, [shown])
    const beginEdit = (event: JournalEvent) => {
        setEditing(event)
        setDraftTitle(event.title)
        setDraftDetail(event.detail)
    }
    const moveDay = (days: number) => {
        const date = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date()
        date.setDate(date.getDate() + days)
        setSelectedDate(localDateKey(date))
    }

    return (
        <div className="page-content journal-page">
            <PageHeader
                title="Journal"
                description="Everything you’ve logged and synced, in one honest timeline."
            />
            <div className="journal-toolbar">
                <div className="journal-toolbar-primary">
                    <SegmentedControl
                        aria-label="Journal time range"
                        value={selectedDate ? 'day' : rangeFrom || rangeTo ? 'range' : 'all'}
                        onChange={value => {
                            setSelectedDate(value === 'day' ? localDateKey(new Date()) : null)
                            if (value === 'range') {
                                const today = localDateKey(new Date())
                                setRangeFrom(current => current || today)
                                setRangeTo(current => current || today)
                            } else {
                                setRangeFrom('')
                                setRangeTo('')
                            }
                        }}
                        data={[
                            { label: 'All entries', value: 'all' },
                            { label: 'Single day', value: 'day' },
                            { label: 'Date range', value: 'range' },
                        ]}
                    />
                    {selectedDate && (
                        <div className="journal-date-navigation" aria-label="Journal day">
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
                                onChange={event => setSelectedDate(event.currentTarget.value)}
                            />
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label="Next day"
                                onClick={() => moveDay(1)}
                            >
                                <IconChevronRight size={18} />
                            </ActionIcon>
                            <Button
                                variant="subtle"
                                color="gray"
                                size="xs"
                                onClick={() => setSelectedDate(localDateKey(new Date()))}
                            >
                                Today
                            </Button>
                        </div>
                    )}
                    {!selectedDate && (rangeFrom || rangeTo) && (
                        <div className="journal-date-navigation" aria-label="Journal date range">
                            <TextInput
                                type="date"
                                aria-label="Journal start date"
                                value={rangeFrom}
                                max={rangeTo || undefined}
                                onChange={event => setRangeFrom(event.currentTarget.value)}
                            />
                            <Text size="sm" c="dimmed">
                                to
                            </Text>
                            <TextInput
                                type="date"
                                aria-label="Journal end date"
                                value={rangeTo}
                                min={rangeFrom || undefined}
                                onChange={event => setRangeTo(event.currentTarget.value)}
                            />
                        </div>
                    )}
                    <TextInput
                        className="journal-search"
                        value={query}
                        onChange={event => setQuery(event.currentTarget.value)}
                        placeholder="Search entries"
                        aria-label="Search journal"
                        leftSection={<IconSearch size={16} />}
                    />
                    <Select
                        className="journal-source"
                        clearable
                        searchable
                        value={source}
                        onChange={setSource}
                        placeholder="All sources"
                        aria-label="Filter journal by source"
                        data={sources}
                    />
                    {devices.length > 0 && (
                        <Select
                            className="journal-source"
                            clearable
                            searchable
                            value={device}
                            onChange={setDevice}
                            placeholder="All devices"
                            aria-label="Filter journal by device"
                            data={devices}
                        />
                    )}
                </div>
                <div className="filter-row" aria-label="Journal categories">
                    {(
                        ['All', 'Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins'] as const
                    ).map(category => (
                        <Button
                            onClick={() => setFilter(category)}
                            key={category}
                            variant={filter === category ? 'filled' : 'subtle'}
                            color={filter === category ? 'dark' : 'gray'}
                            radius="xl"
                            size="xs"
                        >
                            {category}
                        </Button>
                    ))}
                </div>
            </div>
            <section className="panel timeline">
                <Text size="xs" c="dimmed" className="journal-result-count">
                    Showing {shown.length} of {availableEvents.length} loaded entries
                    {hasOlder ? ' · older entries are available' : ''}
                </Text>
                {availableEvents.length === 0 && (
                    <div className="day-divider">
                        <span>Today</span>
                        <small>0 entries</small>
                    </div>
                )}
                {groups.map(group => (
                    <div key={group.label}>
                        <div className="day-divider">
                            <span>{group.label}</span>
                            <small>
                                {group.events.length}{' '}
                                {group.events.length === 1 ? 'entry' : 'entries'}
                            </small>
                        </div>
                        {group.events.map(event => {
                            const { icon: Icon, tone } = eventVisual(event.category)
                            return (
                                <div className="event roomy" key={event.id}>
                                    <time>{event.time}</time>
                                    <div className={`event-icon ${tone}`}>
                                        <Icon size={17} />
                                    </div>
                                    <div className="event-copy">
                                        <Text fw={600}>{event.title}</Text>
                                        <Text size="sm" c="dimmed">
                                            {event.detail}
                                        </Text>
                                        {event.source !== 'You' && (
                                            <Badge variant="light" color="gray">
                                                {event.source}
                                            </Badge>
                                        )}
                                        {event.deviceName && (
                                            <Text size="xs" c="dimmed">
                                                Device: {event.deviceName}
                                            </Text>
                                        )}
                                    </div>
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
                                            <Menu.Item onClick={() => duplicate(event)}>
                                                Log a copy
                                            </Menu.Item>
                                            {event.source === 'You' && (
                                                <>
                                                    <Menu.Item onClick={() => beginEdit(event)}>
                                                        Edit
                                                    </Menu.Item>
                                                    <Menu.Item
                                                        onClick={() => setDeleting(event)}
                                                        color="red"
                                                    >
                                                        Delete
                                                    </Menu.Item>
                                                </>
                                            )}
                                        </Menu.Dropdown>
                                    </Menu>
                                </div>
                            )
                        })}
                    </div>
                ))}
                {shown.length === 0 && availableEvents.length > 0 && (
                    <div className="empty-state">
                        <IconSearch size={24} />
                        <Text fw={600}>Nothing matches</Text>
                        <Text size="sm" c="dimmed">
                            No entries match this date, search, or category. Change the day or clear
                            a filter to see your timeline again.
                        </Text>
                    </div>
                )}
                {availableEvents.length === 0 && (
                    <div className="empty-state">
                        <IconPlus size={24} />
                        <Text fw={600}>Your journal is ready</Text>
                        <Text size="sm" c="dimmed">
                            Meals, measurements, check-ins, and synced activity will appear here.
                            Use Quick add to record your first entry.
                        </Text>
                    </div>
                )}
                {hasOlder && !selectedDate && (
                    <div className="journal-load-more">
                        <Button variant="default" loading={loadingOlder} onClick={loadOlder}>
                            Load older entries
                        </Button>
                    </div>
                )}
            </section>
            <Modal
                opened={Boolean(editing)}
                onClose={() => setEditing(null)}
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
                    <Button variant="default" onClick={() => setEditing(null)}>
                        Cancel
                    </Button>
                    <Button
                        disabled={!draftTitle.trim()}
                        onClick={async () => {
                            if (!editing) return
                            if (
                                await update(editing, {
                                    title: draftTitle,
                                    detail: draftDetail,
                                    time: editing.time,
                                })
                            )
                                setEditing(null)
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
                    This removes {deleting?.title} from your journal and associated dashboard data.
                </Text>
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={() => setDeleting(null)}>
                        Keep entry
                    </Button>
                    <Button
                        color="red"
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
