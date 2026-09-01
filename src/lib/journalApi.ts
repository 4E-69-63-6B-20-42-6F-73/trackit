import { environment } from '../app/env'
import type { JournalDetailView, JournalEvent } from '@trackit/domain/types'
import { friendlySourceName } from '@trackit/domain/formatting'
import { sharedJsonRequest } from './sharedRequest'

type ApiJournalEntry = {
    id: string
    definitionId: string
    entityType?: JournalEvent['entityType']
    entityId?: string
    editable?: boolean
    category: JournalEvent['category']
    title: string
    detail: string
    source: string
    deviceName?: string
    observedAt: string
    startedAt?: string
    endedAt?: string
    version: number
    detailView?: JournalDetailView
}

export type JournalQuery = {
    from?: string
    to?: string
    before?: string
    category?: JournalEvent['category']
    source?: string
    limit?: number
}

const apiUrl = (path: string) => `${environment.VITE_API_URL}${path}`
const toEvent = (entry: ApiJournalEntry): JournalEvent => ({
    id: entry.id,
    definitionId: entry.definitionId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    editable: entry.editable,
    category: entry.category,
    title: entry.title,
    detail: entry.detail,
    source: friendlySourceName(entry.source),
    sourceRaw: entry.source,
    deviceName: entry.deviceName,
    observedAt: entry.observedAt,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    detailView: entry.detailView,
    time: new Date(entry.observedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    }),
    version: entry.version,
})

export async function listJournal(
    query: JournalQuery = {},
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

export async function getJournalEntry(id: string, signal?: AbortSignal): Promise<JournalEvent> {
    const body = await sharedJsonRequest<{ data: ApiJournalEntry }>(
        apiUrl(`/api/journal/${encodeURIComponent(id)}`),
        signal,
    )
    return toEvent(body.data)
}
