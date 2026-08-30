import { useEffect, useState } from 'react'
import type { JournalEvent } from '../domain/types'
import { listJournal, type JournalQuery } from '../lib/journalApi'

export type ServerStatus = 'connecting' | 'online' | 'offline'

export function useJournal(query: JournalQuery & { limit: number }, enabled = true) {
    const { from, to, category, source, limit } = query
    const [events, setEvents] = useState<JournalEvent[]>([])
    const [status, setStatus] = useState<ServerStatus>(enabled ? 'connecting' : 'online')
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [hasOlder, setHasOlder] = useState(false)
    const [failure, setFailure] = useState<{
        message: string
        retry: () => Promise<void>
    } | null>(null)

    const [refreshKey, setRefreshKey] = useState(0)
    useEffect(() => {
        const refresh = () => setRefreshKey(key => key + 1)
        window.addEventListener('trackit:observations-changed', refresh)
        return () => window.removeEventListener('trackit:observations-changed', refresh)
    }, [])
    useEffect(() => {
        if (!enabled) {
            queueMicrotask(() => {
                setStatus('online')
                setEvents([])
                setHasOlder(false)
                setFailure(null)
            })
            return
        }
        let active = true
        const controller = new AbortController()
        queueMicrotask(() => {
            if (active) setStatus('connecting')
        })
        listJournal({ from, to, category, source, limit }, controller.signal)
            .then(records => {
                if (!active) return
                setStatus('online')
                setEvents(records)
                setHasOlder(records.length === limit)
                setFailure(null)
            })
            .catch(() => {
                if (!active) return
                setStatus('offline')
                setEvents([])
                setFailure({
                    message:
                        'The journal could not be loaded from your server. No local copy is being shown.',
                    retry: async () => {
                        setEvents(await listJournal({ from, to, category, source, limit }))
                        setStatus('online')
                        setFailure(null)
                    },
                })
            })
        return () => {
            active = false
            controller.abort()
        }
    }, [category, enabled, from, limit, refreshKey, source, to])

    const loadOlder = async () => {
        const oldest = events.at(-1)
        if (!oldest || loadingOlder || !hasOlder) return
        setLoadingOlder(true)
        try {
            const records = await listJournal({
                from,
                to,
                category,
                source,
                before: oldest.observedAt,
                beforeId: oldest.id,
                limit,
            })
            setEvents(current => {
                const known = new Set(current.map(record => record.id))
                return [...current, ...records.filter(record => !known.has(record.id))]
            })
            setHasOlder(records.length === limit)
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
        syncFailure: failure?.message ?? '',
        retry: () => void failure?.retry(),
        hasOlder,
        loadingOlder,
        loadOlder,
    }
}
