import { Badge, Text } from '@mantine/core'
import type { KeyboardEvent, ReactNode } from 'react'
import { eventVisual } from '../domain/data'
import type { JournalEvent } from '../domain/types'

export function JournalEventList({
    events,
    roomy = false,
    showChevron = false,
    renderActions,
    onSelect,
}: {
    events: JournalEvent[]
    roomy?: boolean
    showChevron?: boolean
    renderActions?: (event: JournalEvent) => ReactNode
    onSelect?: (event: JournalEvent) => void
}) {
    const journalStyle = roomy || showChevron
    const activate = (event: JournalEvent, keyboardEvent?: KeyboardEvent<HTMLDivElement>) => {
        if (keyboardEvent && !['Enter', ' '].includes(keyboardEvent.key)) return
        keyboardEvent?.preventDefault()
        onSelect?.(event)
    }

    return events.map(event => {
        const { icon: Icon, tone } = eventVisual(event.category)
        return (
            <div
                className={`event${journalStyle ? ' roomy' : ''}${onSelect ? ' event-selectable' : ''}`}
                key={event.id}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={() => activate(event)}
                onKeyDown={keyboardEvent => activate(event, keyboardEvent)}
            >
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
                {renderActions && (
                    <div onClick={clickEvent => clickEvent.stopPropagation()}>
                        {renderActions(event)}
                    </div>
                )}
            </div>
        )
    })
}
