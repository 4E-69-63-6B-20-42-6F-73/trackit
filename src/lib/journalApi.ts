import { friendlySourceName } from '@trackit/domain/formatting'
import type { JournalEvent } from '@trackit/domain/types'
import type { paths } from './api.generated'
import { apiClient } from './apiClient'

type ApiJournalEntry =
    paths['/api/journal']['get']['responses'][200]['content']['application/json']['data'][number]

export type JournalQuery = {
    from?: string
    to?: string
    before?: string
    category?: JournalEvent['category']
    source?: string
    limit?: number
}

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
    const { data, response } = await apiClient.GET('/api/journal', {
        params: { query },
        signal,
    })
    if (!response.ok || !data) throw new Error('Journal unavailable')
    return data.data.map(toEvent)
}

export async function getJournalEntry(id: string, signal?: AbortSignal): Promise<JournalEvent> {
    const { data, response } = await apiClient.GET('/api/journal/{id}', {
        params: { path: { id } },
        signal,
    })
    if (!response.ok || !data) throw new Error('Journal entry unavailable')
    return toEvent(data.data)
}
