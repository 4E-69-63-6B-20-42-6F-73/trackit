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
const csrfToken = () =>
    document.cookie
        .split('; ')
        .find(value => value.startsWith('trackit_csrf='))
        ?.split('=')[1]

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

const observedAt = (time: string, existing?: string) => {
    const date = existing ? new Date(existing) : new Date()
    const [hours, minutes] = time.split(':').map(Number)
    date.setHours(hours, minutes, 0, 0)
    return date.toISOString()
}

export async function updateJournal(
    event: JournalEvent,
    changes: Pick<JournalEvent, 'title' | 'detail' | 'time'>,
): Promise<JournalEvent> {
    const response = await fetch(apiUrl(`/api/observations/${event.id}`), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken() ?? '',
        },
        body: JSON.stringify({
            title: changes.title,
            textValue: event.observation ? undefined : changes.detail,
            detail: changes.detail,
            observedAt: observedAt(changes.time, event.observedAt),
            version: event.version ?? 1,
        }),
    })
    if (!response.ok) throw new Error(`Journal update failed (${response.status})`)
    const body = (await response.json()) as { data: { version: number; observedAt: string } }
    return {
        ...event,
        ...changes,
        observedAt: body.data.observedAt,
        version: body.data.version,
    }
}

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

export async function createJournal(event: JournalEvent): Promise<JournalEvent> {
    const timestamp = observedAt(event.time, event.observedAt)
    const response = await fetch(apiUrl('/api/observations'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken() ?? '',
        },
        body: JSON.stringify({
            id: event.id,
            metric:
                event.observation?.metric ??
                (event.category === 'Check-ins' ? 'check_in' : 'journal_event'),
            valueType: event.observation ? 'number' : event.detail ? 'text' : 'event',
            value: event.observation?.value,
            unit: event.observation?.unit,
            textValue: event.observation ? undefined : event.detail,
            title: event.title,
            category: event.category,
            observedAt: event.observation?.observedAt ?? timestamp,
            source: event.source,
            attributes: { journalDetail: event.detail, sourceLabel: event.source },
        }),
    })
    if (!response.ok) throw new Error(`Journal create failed (${response.status})`)
    const body = (await response.json()) as { data: { version: number; observedAt: string } }
    return { ...event, observedAt: body.data.observedAt, version: body.data.version }
}

export async function deleteJournal(id: string) {
    const response = await fetch(apiUrl(`/api/observations/${id}`), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrfToken() ?? '' },
    })
    if (!response.ok && response.status !== 404) {
        throw new Error(`Journal delete failed (${response.status})`)
    }
}
