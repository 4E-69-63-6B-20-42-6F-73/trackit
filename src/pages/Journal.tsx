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
} from '@mantine/core'
import {
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconPlus,
    IconSearch,
} from '@tabler/icons-react'
import { eventVisual } from '../domain/data'
import type { Category, JournalEvent } from '../domain/types'

const localDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function Journal({
    events,
    remove,
    duplicate,
    update,
    onSelectedDateChange,
}: {
    events: JournalEvent[]
    remove: (id: string) => void
    duplicate: (event: JournalEvent) => void
    update: (
        event: JournalEvent,
        changes: Pick<JournalEvent, 'title' | 'detail' | 'time'>,
    ) => Promise<boolean>
    onSelectedDateChange?: (date: string | null) => void
}) {
    const [filter, setFilter] = useState<'All' | Category>('All')
    const [query, setQuery] = useState('')
    const [selectedDate, setSelectedDate] = useState<string | null>(null)
    const [editing, setEditing] = useState<JournalEvent | null>(null)
    const [deleting, setDeleting] = useState<JournalEvent | null>(null)
    const [draftTitle, setDraftTitle] = useState('')
    const [draftDetail, setDraftDetail] = useState('')
    useEffect(() => onSelectedDateChange?.(selectedDate), [onSelectedDateChange, selectedDate])
    const shown = useMemo(
        () =>
            events.filter(
                event =>
                    (!selectedDate ||
                        localDateKey(new Date(event.observedAt ?? 0)) === selectedDate) &&
                    (filter === 'All' || event.category === filter) &&
                    `${event.title} ${event.detail} ${event.source}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
            ),
        [events, filter, query, selectedDate],
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
        ).map(([, group]) => group)
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
            <div className="section-title">
                <div>
                    <h1>Journal</h1>
                    <Text className="subhead">
                        Everything you’ve logged and synced, in one honest timeline.
                    </Text>
                </div>
            </div>
            <div className="journal-toolbar">
                <div className="journal-toolbar-primary">
                    <SegmentedControl
                        aria-label="Journal time range"
                        value={selectedDate ? 'day' : 'all'}
                        onChange={value =>
                            setSelectedDate(value === 'day' ? localDateKey(new Date()) : null)
                        }
                        data={[
                            { label: 'All entries', value: 'all' },
                            { label: 'Single day', value: 'day' },
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
                    <TextInput
                        className="journal-search"
                        value={query}
                        onChange={event => setQuery(event.currentTarget.value)}
                        placeholder="Search entries"
                        aria-label="Search journal"
                        leftSection={<IconSearch size={16} />}
                    />
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
                {events.length === 0 && (
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
                                    </div>
                                    <Menu>
                                        <Menu.Target>
                                            <ActionIcon
                                                aria-label={`Actions for ${event.title}`}
                                                variant="subtle"
                                                color="gray"
                                            >
                                                <IconChevronDown size={17} />
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
                {shown.length === 0 && events.length > 0 && (
                    <div className="empty-state">
                        <IconSearch size={24} />
                        <Text fw={600}>Nothing matches</Text>
                        <Text size="sm" c="dimmed">
                            No entries match this date, search, or category. Change the day or clear
                            a filter to see your timeline again.
                        </Text>
                    </div>
                )}
                {events.length === 0 && (
                    <div className="empty-state">
                        <IconPlus size={24} />
                        <Text fw={600}>Your journal is ready</Text>
                        <Text size="sm" c="dimmed">
                            Meals, measurements, check-ins, and synced activity will appear here.
                            Use Quick add to record your first entry.
                        </Text>
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
