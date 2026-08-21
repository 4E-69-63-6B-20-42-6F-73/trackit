import { useEffect, useState } from 'react'
import { initialEvents } from '../domain/data'
import type { JournalEvent } from '../domain/types'
import { createJournal, deleteJournal, listJournal, updateJournal } from '../lib/journalApi'

export type ServerStatus = 'connecting' | 'online' | 'offline'

const storedEvents = () => {
    try {
        return JSON.parse(localStorage.getItem('trackit-events') || 'null') as JournalEvent[] | null
    } catch {
        return null
    }
}

export function useJournal() {
    const [browserEvents] = useState(storedEvents)
    const [events, setEvents] = useState<JournalEvent[]>(browserEvents || initialEvents)
    const [status, setStatus] = useState<ServerStatus>('connecting')
    const [migrationPending, setMigrationPending] = useState(false)
    const [failure, setFailure] = useState<{
        message: string
        retry: () => Promise<void>
    } | null>(null)

    useEffect(() => {
        let active = true
        listJournal()
            .then(records => {
                if (!active) return
                setStatus('online')
                if (records.length > 0) setEvents(records)
                else if (browserEvents?.length) setMigrationPending(true)
                else setEvents([])
            })
            .catch(() => active && setStatus('offline'))
        return () => {
            active = false
        }
    }, [browserEvents])

    useEffect(() => localStorage.setItem('trackit-events', JSON.stringify(events)), [events])

    const add = (event: JournalEvent, allowDuplicate = false) => {
        const eventTime = new Date()
        const [hours, minutes] = event.time.split(':').map(Number)
        eventTime.setHours(hours, minutes, 0, 0)
        const duplicate = events.some(item => {
            const itemTime = new Date()
            const [itemHours, itemMinutes] = item.time.split(':').map(Number)
            itemTime.setHours(itemHours, itemMinutes, 0, 0)
            return (
                item.category === event.category &&
                item.title.trim().toLowerCase() === event.title.trim().toLowerCase() &&
                item.detail.trim().toLowerCase() === event.detail.trim().toLowerCase() &&
                Math.abs(itemTime.getTime() - eventTime.getTime()) <= 2 * 60 * 1000
            )
        })
        if (duplicate && !allowDuplicate) return false
        setEvents(current => [event, ...current.filter(item => item.id !== event.id)])
        const persist = async () => {
            try {
                const saved = await createJournal(event)
                setEvents(current => [saved, ...current.filter(item => item.id !== saved.id)])
                setFailure(null)
                setStatus('online')
            } catch {
                setFailure({
                    message:
                        'Your entry is kept in this browser. Reconnect and retry to persist it.',
                    retry: persist,
                })
            }
        }
        if (status === 'online') void persist()
        else if (!import.meta.env.DEV) {
            setFailure({
                message: 'The server is offline. Your entry is kept in this browser until retry.',
                retry: persist,
            })
        }
        return true
    }

    const update = async (
        event: JournalEvent,
        changes: Pick<JournalEvent, 'title' | 'detail' | 'time'>,
    ) => {
        const optimistic = { ...event, ...changes }
        setEvents(current => current.map(item => (item.id === event.id ? optimistic : item)))
        try {
            const saved = await updateJournal(event, changes)
            setEvents(current => current.map(item => (item.id === saved.id ? saved : item)))
            setFailure(null)
            return true
        } catch {
            setEvents(current => current.map(item => (item.id === event.id ? event : item)))
            setFailure({
                message: 'Your edit was not saved. The previous entry was restored.',
                retry: async () => {
                    await update(event, changes)
                },
            })
            return false
        }
    }

    const remove = (id: string) => {
        const removed = events.find(event => event.id === id)
        setEvents(current => current.filter(event => event.id !== id))
        const persist = async () => {
            try {
                await deleteJournal(id)
                setFailure(null)
                setStatus('online')
            } catch {
                if (removed) {
                    setEvents(current => [removed, ...current.filter(event => event.id !== id)])
                }
                setFailure({
                    message: 'Delete was not confirmed by the server. The entry was restored.',
                    retry: async () => {
                        setEvents(current => current.filter(event => event.id !== id))
                        await persist()
                    },
                })
            }
        }
        if (status === 'online') void persist()
        else if (removed && !import.meta.env.DEV) {
            setEvents(current => [removed, ...current.filter(event => event.id !== id)])
            setFailure({
                message: 'Delete needs a server connection. The entry was restored.',
                retry: async () => {
                    setEvents(current => current.filter(event => event.id !== id))
                    await persist()
                },
            })
        }
    }

    const migrate = async () => {
        await Promise.all(events.map(createJournal))
        localStorage.removeItem('trackit-events')
        setMigrationPending(false)
        setEvents(await listJournal())
    }

    return {
        events,
        status,
        migrationPending,
        dismissMigration: () => setMigrationPending(false),
        migrate,
        add,
        remove,
        update,
        syncFailure: failure?.message ?? '',
        retry: () => void failure?.retry(),
    }
}
