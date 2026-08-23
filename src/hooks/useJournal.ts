import { useEffect, useState } from 'react'
import type { JournalEvent } from '../domain/types'
import { createJournal, deleteJournal, listJournal, updateJournal } from '../lib/journalApi'

export type ServerStatus = 'connecting' | 'online' | 'offline'

export function useJournal() {
    const [events, setEvents] = useState<JournalEvent[]>([])
    const [status, setStatus] = useState<ServerStatus>('connecting')
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
                setEvents(records)
            })
            .catch(() => {
                if (!active) return
                setStatus('offline')
                setEvents([])
                setFailure({
                    message:
                        'The journal could not be loaded from your server. No local copy is being shown.',
                    retry: async () => {
                        setEvents(await listJournal())
                        setStatus('online')
                        setFailure(null)
                    },
                })
            })
        return () => {
            active = false
        }
    }, [])

    const add = (event: JournalEvent, allowDuplicate = false) => {
        const timestamp = (item: JournalEvent) => {
            if (item.observedAt) return new Date(item.observedAt)
            const date = new Date()
            const [hours, minutes] = item.time.split(':').map(Number)
            date.setHours(hours, minutes, 0, 0)
            return date
        }
        const eventTime = timestamp(event)
        const duplicate = events.some(item => {
            const itemTime = timestamp(item)
            return (
                item.category === event.category &&
                item.title.trim().toLowerCase() === event.title.trim().toLowerCase() &&
                item.detail.trim().toLowerCase() === event.detail.trim().toLowerCase() &&
                Math.abs(itemTime.getTime() - eventTime.getTime()) <= 2 * 60 * 1000
            )
        })
        if (duplicate && !allowDuplicate) return false
        const persist = async () => {
            try {
                const saved = await createJournal(event)
                setEvents(current => [saved, ...current.filter(item => item.id !== saved.id)])
                setFailure(null)
                setStatus('online')
            } catch {
                setEvents(current => current.filter(item => item.id !== event.id))
                setFailure({
                    message:
                        'The entry was not saved to your server and was discarded. Reconnect and retry.',
                    retry: persist,
                })
            }
        }
        setEvents(current => [event, ...current.filter(item => item.id !== event.id)])
        void persist()
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
        else void persist()
    }

    return {
        events,
        status,
        add,
        remove,
        update,
        syncFailure: failure?.message ?? '',
        retry: () => void failure?.retry(),
    }
}
