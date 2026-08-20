import { useMemo, useState } from 'react'
import { ActionIcon, Badge, Button, Menu, Text, TextInput } from '@mantine/core'
import { IconChevronDown, IconSearch } from '@tabler/icons-react'
import { eventVisual } from '../domain/data'
import type { Category, JournalEvent } from '../domain/types'

export function Journal({
    events,
    remove,
    duplicate,
}: {
    events: JournalEvent[]
    remove: (id: string) => void
    duplicate: (event: JournalEvent) => void
}) {
    const [filter, setFilter] = useState<'All' | Category>('All')
    const [query, setQuery] = useState('')
    const shown = useMemo(
        () =>
            events.filter(
                event =>
                    (filter === 'All' || event.category === filter) &&
                    `${event.title} ${event.detail}`.toLowerCase().includes(query.toLowerCase()),
            ),
        [events, filter, query],
    )
    return (
        <div className="page-content simple-page">
            <div className="section-title">
                <div>
                    <Text className="date">YOUR RECORD</Text>
                    <h1>Journal</h1>
                    <Text className="subhead">
                        Everything you’ve logged and synced, in one honest timeline.
                    </Text>
                </div>
                <TextInput
                    value={query}
                    onChange={e => setQuery(e.currentTarget.value)}
                    placeholder="Search your journal"
                    leftSection={<IconSearch size={16} />}
                />
            </div>
            <div className="filter-row">
                {(['All', 'Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins'] as const).map(
                    x => (
                        <Button
                            onClick={() => setFilter(x)}
                            key={x}
                            variant={filter === x ? 'filled' : 'default'}
                            color={filter === x ? 'dark' : undefined}
                            radius="xl"
                            size="xs"
                        >
                            {x}
                        </Button>
                    ),
                )}
            </div>
            <section className="panel timeline">
                <div className="day-divider">
                    <span>Today</span>
                    <small>
                        {shown.length} {shown.length === 1 ? 'entry' : 'entries'}
                    </small>
                </div>
                {shown.map(event => {
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
                            </div>
                            <Badge variant="light" color="gray">
                                {event.source}
                            </Badge>
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
                                        Duplicate
                                    </Menu.Item>
                                    {event.source === 'You' && (
                                        <Menu.Item onClick={() => remove(event.id)} color="red">
                                            Delete
                                        </Menu.Item>
                                    )}
                                </Menu.Dropdown>
                            </Menu>
                        </div>
                    )
                })}
                {shown.length === 0 && (
                    <div className="empty-state">
                        <IconSearch size={24} />
                        <Text fw={600}>Nothing matches</Text>
                        <Text size="sm" c="dimmed">
                            Try another filter or search.
                        </Text>
                    </div>
                )}
            </section>
        </div>
    )
}
