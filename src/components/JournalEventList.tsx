import { Badge, Text } from '@mantine/core'
import { Fragment, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { eventVisual } from '../domain/data'
import type { JournalEvent } from '../domain/types'
import { JournalEntryDetailModal } from './JournalEntryDetailModal'

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
    const [selected, setSelected] = useState<JournalEvent | null>(null)
    const activate = (event: JournalEvent, keyboardEvent?: KeyboardEvent<HTMLDivElement>) => {
        if (keyboardEvent && !['Enter', ' '].includes(keyboardEvent.key)) return
        keyboardEvent?.preventDefault()
        setSelected(event)
    }

    return (
        <Fragment>
            {events.map(event => {
                const { icon: Icon, tone } = eventVisual(event.category)
                const actions = event.source === 'You' ? renderActions?.(event) : null
                return (
                    <div
                        className={`event${journalStyle ? ' roomy' : ''} event-selectable`}
                        key={event.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => activate(event)}
                        onKeyDown={keyboardEvent => activate(event, keyboardEvent)}
                    >
                        <time>{event.time}</time>
                        <div className={`event-icon ${tone}`}>
                            <Icon size={17} />
                        </div>
                        <div className="event-copy">
                            <Text component="div" fw={600} size={journalStyle ? undefined : 'sm'}>
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
                        {actions && (
                            <div onClick={clickEvent => clickEvent.stopPropagation()}>
                                {actions}
                            </div>
                        )}
                    </div>
                )
            })}
            <JournalEntryDetailModal event={selected} onClose={() => setSelected(null)} />
        </Fragment>
    )
}
