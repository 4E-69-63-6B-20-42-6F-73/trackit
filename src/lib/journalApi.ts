import { environment } from '../app/env'
import type { JournalEvent } from '../domain/types'

type ApiJournalEntry = {
    id: string
    category: JournalEvent['category']
    title: string
    detail: string
    source: string
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
    source: entry.source,
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
    const response = await fetch(apiUrl(`/api/journal/${event.id}`), {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken() ?? '',
        },
        body: JSON.stringify({
            title: changes.title,
            detail: changes.detail,
            observedAt: observedAt(changes.time, event.observedAt),
            version: event.version ?? 1,
        }),
    })
    if (!response.ok) throw new Error(`Journal update failed (${response.status})`)
    const body = (await response.json()) as { data: ApiJournalEntry }
    return toEvent(body.data)
}

export async function listJournal(): Promise<JournalEvent[]> {
    const response = await fetch(apiUrl('/api/journal'), { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`Journal request failed (${response.status})`)
    const body = (await response.json()) as { data: ApiJournalEntry[] }
    return body.data.map(toEvent)
}

export async function createJournal(event: JournalEvent): Promise<JournalEvent> {
    const response = await fetch(apiUrl('/api/journal'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'content-type': 'application/json',
            'x-csrf-token': csrfToken() ?? '',
        },
        body: JSON.stringify({ ...event, observedAt: observedAt(event.time, event.observedAt) }),
    })
    if (!response.ok) throw new Error(`Journal create failed (${response.status})`)
    const body = (await response.json()) as { data: ApiJournalEntry }
    return toEvent(body.data)
}

export async function deleteJournal(id: string) {
    const response = await fetch(apiUrl(`/api/journal/${id}`), {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': csrfToken() ?? '' },
    })
    if (!response.ok && response.status !== 404) {
        throw new Error(`Journal delete failed (${response.status})`)
    }
}
