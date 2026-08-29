import { useState } from 'react'
import type { JournalEvent } from '../domain/types'
import {
    createObservationFromEvent,
    deleteObservation,
    updateObservationFromEvent,
} from '../lib/observationApi'

const timestamp = (event: JournalEvent) => {
    if (event.observedAt) return new Date(event.observedAt)
    const date = new Date()
    const [hours, minutes] = event.time.split(':').map(Number)
    date.setHours(hours, minutes, 0, 0)
    return date
}

export function useObservationCommands(events: JournalEvent[], refresh: () => void) {
    const [failure, setFailure] = useState<{ message: string; retry: () => Promise<void> } | null>(
        null,
    )
    const run = async (command: () => Promise<void>, message: string) => {
        try {
            await command()
            setFailure(null)
            refresh()
            window.dispatchEvent(new Event('trackit:observations-changed'))
            return true
        } catch {
            setFailure({ message, retry: async () => void (await run(command, message)) })
            return false
        }
    }
    const add = (event: JournalEvent, allowDuplicate = false) => {
        const eventTime = timestamp(event)
        const duplicate = events.some(
            item =>
                item.category === event.category &&
                item.title.trim().toLowerCase() === event.title.trim().toLowerCase() &&
                item.detail.trim().toLowerCase() === event.detail.trim().toLowerCase() &&
                Math.abs(timestamp(item).getTime() - eventTime.getTime()) <= 2 * 60 * 1000,
        )
        if (duplicate && !allowDuplicate) return false
        void run(
            () => createObservationFromEvent(event),
            'The observation was not saved. Reconnect and retry.',
        )
        return true
    }
    const update = (
        event: JournalEvent,
        changes: Pick<JournalEvent, 'title' | 'detail' | 'time'>,
    ) =>
        run(
            () => updateObservationFromEvent(event, changes),
            'The observation edit was not saved. Reconnect and retry.',
        )
    const remove = (id: string) => {
        void run(
            () => deleteObservation(id),
            'The observation was not deleted. Reconnect and retry.',
        )
    }
    return {
        add,
        update,
        remove,
        commandFailure: failure?.message ?? '',
        retryCommand: () => void failure?.retry(),
    }
}
