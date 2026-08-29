import { environment } from '../app/env'
import type { JournalEvent } from '../domain/types'
import { friendlySourceName } from '../domain/formatting'
import { sharedJsonRequest } from './sharedRequest'

type ApiJournalEntry = {
    id: string
    category: JournalEvent['category']
    title: string
    detail: string
    source: string
    deviceName?: string
    observedAt: string
    version: number
}

const apiUrl = (path: string) => `${environment.VITE_API_URL}${path}`
const toEvent = (entry: ApiJournalEntry): JournalEvent => ({
    id: entry.id,
    category: entry.category,
    title: entry.title,
    detail: entry.detail,
    source: friendlySourceName(entry.source),
    deviceName: entry.deviceName,
    observedAt: entry.observedAt,
    time: new Date(entry.observedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    }),
    version: entry.version,
})

export async function listJournal(
    query: {
        from?: string
        to?: string
        before?: string
        category?: JournalEvent['category']
        source?: string
        limit?: number
    } = {},
    signal?: AbortSignal,
): Promise<JournalEvent[]> {
    const search = new URLSearchParams(
        Object.entries(query)
            .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
            .map(([key, value]) => [key, String(value)]),
    )
    const body = await sharedJsonRequest<{ data: ApiJournalEntry[] }>(
        apiUrl(`/api/journal?${search}`),
        signal,
    )
    return body.data.map(toEvent)
}
