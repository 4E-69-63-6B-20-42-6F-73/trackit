import { useEffect, useState } from 'react'
import type { JournalEvent } from '../domain/types'
import { listJournal } from '../lib/journalApi'

export type ServerStatus = 'connecting' | 'online' | 'offline'

export function useJournal(query: { from?: string; to?: string; limit: number }) {
    const { from, to, limit } = query
    const [events, setEvents] = useState<JournalEvent[]>([])
    const [status, setStatus] = useState<ServerStatus>('connecting')
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [hasOlder, setHasOlder] = useState(false)
    const [failure, setFailure] = useState<{
        message: string
        retry: () => Promise<void>
    } | null>(null)

    const [refreshKey, setRefreshKey] = useState(0)
    useEffect(() => {
        let active = true
        const controller = new AbortController()
        queueMicrotask(() => {
            if (active) setStatus('connecting')
        })
        listJournal({ from, to, limit }, controller.signal)
            .then(records => {
                if (!active) return
                setStatus('online')
                setEvents(records)
                setHasOlder(records.length === 100)
            })
            .catch(() => {
                if (!active) return
                setStatus('offline')
                setEvents([])
                setFailure({
                    message:
                        'The journal could not be loaded from your server. No local copy is being shown.',
                    retry: async () => {
                        setEvents(await listJournal({ from, to, limit }))
                        setStatus('online')
                        setFailure(null)
                    },
                })
            })
        return () => {
            active = false
            controller.abort()
        }
    }, [from, limit, refreshKey, to])

    const loadOlder = async () => {
        const oldest = events.at(-1)?.observedAt
        if (!oldest || loadingOlder || !hasOlder) return
        setLoadingOlder(true)
        try {
            const records = await listJournal({ before: oldest, limit: 100 })
            setEvents(current => [
                ...current,
                ...records.filter(record => !current.some(item => item.id === record.id)),
            ])
            setHasOlder(records.length === 100)
        } catch {
            setFailure({
                message: 'Older journal entries could not be loaded.',
                retry: loadOlder,
            })
        } finally {
            setLoadingOlder(false)
        }
    }

    return {
        events,
        status,
        refresh: () => setRefreshKey(key => key + 1),
        syncFailure: failure?.message ?? '',
        retry: () => void failure?.retry(),
        hasOlder,
        loadingOlder,
        loadOlder,
    }
}
