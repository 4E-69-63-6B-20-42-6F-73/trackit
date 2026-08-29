import { environment } from '../app/env'
import type { Observation } from '../domain/health'
import type { JournalEvent } from '../domain/types'
import { authRequest } from './authApi'
import { sharedJsonRequest } from './sharedRequest'

export type MetricSourceSummary = {
    definitionId: string
    provider: string
    connector: string | null
}

export async function createObservation(
    id: string,
    input: NonNullable<JournalEvent['observation']>,
) {
    const response = await authRequest('/api/observations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...input, source: 'You' }),
    })
    if (!response.ok) throw new Error('Observation could not be saved')
    return ((await response.json()) as { data: Observation }).data
}

const observedAt = (time: string, existing?: string) => {
    const date = existing ? new Date(existing) : new Date()
    const [hours, minutes] = time.split(':').map(Number)
    date.setHours(hours, minutes, 0, 0)
    return date.toISOString()
}

export async function createObservationFromEvent(event: JournalEvent): Promise<void> {
    const timestamp = observedAt(event.time, event.observedAt)
    if (event.category === 'Meals') {
        const mealType = ['Breakfast', 'Lunch', 'Dinner', 'Snack'].includes(event.title)
            ? event.title
            : 'Snack'
        const response = await authRequest('/api/meals', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                id: event.id,
                name: event.detail || event.title,
                mealType,
                eatenAt: event.observedAt ?? timestamp,
                nutrients: {},
            }),
        })
        if (!response.ok) throw new Error(`Meal observation create failed (${response.status})`)
        return
    }
    const response = await authRequest('/api/observations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            id: event.id,
            definitionId:
                event.observation?.definitionId ?? (event.title === 'Note' ? 'note' : 'check_in'),
            valueType: event.observation ? 'number' : event.detail ? 'text' : 'event',
            value: event.observation?.value,
            unit: event.observation?.unit,
            textValue: event.observation ? undefined : event.detail,
            title: event.title,
            category: event.category,
            observedAt: event.observation?.observedAt ?? timestamp,
            source: event.source,
            attributes: { description: event.detail, sourceLabel: event.source },
        }),
    })
    if (!response.ok) throw new Error(`Observation create failed (${response.status})`)
}

export async function updateObservationFromEvent(
    event: JournalEvent,
    changes: Pick<JournalEvent, 'title' | 'detail' | 'time'>,
): Promise<void> {
    const response = await authRequest(`/api/observations/${event.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            title: changes.title,
            textValue: event.observation ? undefined : changes.detail,
            detail: changes.detail,
            observedAt: observedAt(changes.time, event.observedAt),
            version: event.version ?? 1,
        }),
    })
    if (!response.ok) throw new Error(`Observation update failed (${response.status})`)
}

export async function deleteObservation(id: string): Promise<void> {
    const response = await authRequest(`/api/observations/${id}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404)
        throw new Error(`Observation delete failed (${response.status})`)
}

export async function listObservations(
    range: { from?: string; to?: string; definitionIds?: string[] } = {},
    signal?: AbortSignal,
): Promise<Observation[]> {
    const query = new URLSearchParams()
    if (range.from) query.set('from', range.from)
    if (range.to) query.set('to', range.to)
    if (range.definitionIds?.length) query.set('definitionIds', range.definitionIds.join(','))
    return (
        await sharedJsonRequest<{ data: Observation[] }>(
            `${environment.VITE_API_URL}/api/observations?${query}`,
            signal,
        )
    ).data
}

export async function listMetricSources(signal?: AbortSignal): Promise<MetricSourceSummary[]> {
    return (
        await sharedJsonRequest<{ data: MetricSourceSummary[] }>(
            `${environment.VITE_API_URL}/api/metric-sources`,
            signal,
        )
    ).data
}

export async function setObservationExcluded(observation: Observation, excluded: boolean) {
    const response = await authRequest(`/api/observations/${observation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ excluded, version: observation.version }),
    })
    if (!response.ok) throw new Error('Could not update observation')
    return ((await response.json()) as { data: Observation }).data
}
