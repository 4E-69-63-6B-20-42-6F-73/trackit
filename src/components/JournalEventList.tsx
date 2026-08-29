import { Badge, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { eventVisual } from '../domain/data'
import type { JournalEvent } from '../domain/types'

export function JournalEventList({
    events,
    roomy = false,
    showChevron = false,
    renderActions,
}: {
    events: JournalEvent[]
    roomy?: boolean
    showChevron?: boolean
    renderActions?: (event: JournalEvent) => ReactNode
}) {
    const journalStyle = roomy || showChevron

    return events.map(event => {
        const { icon: Icon, tone } = eventVisual(event.category)
        return (
            <div className={`event${journalStyle ? ' roomy' : ''}`} key={event.id}>
                <time>{event.time}</time>
                <div className={`event-icon ${tone}`}>
                    <Icon size={17} />
                </div>
                <div className="event-copy">
                    <Text fw={600} size={journalStyle ? undefined : 'sm'}>
                        {event.title}
                        {event.source !== 'You' && (
                            <Badge variant="light" color="gray" fw={500}>
                                {event.source}
                            </Badge>
                        )}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {event.detail}
                    </Text>
                </div>
                {renderActions?.(event)}
            </div>
        )
    })
}
