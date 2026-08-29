import { environment } from '../app/env'
import type { NumericObservation } from '../domain/health'
import type { Category } from '../domain/types'
import { authRequest } from './authApi'
import { sharedJsonRequest } from './sharedRequest'

export type MetricSourceSummary = {
    definitionId: string
    provider: string
    connector: string | null
}

export type CreateObservationInput = {
    id?: string
    definitionId: string
    valueType: 'number' | 'text' | 'boolean' | 'category' | 'event'
    value?: number
    unit?: string
    textValue?: string
    booleanValue?: boolean
    categoryValue?: string
    title?: string
    category?: Category
    attributes?: Record<string, unknown>
    observedAt: string
    source: string
}

export type UpdateObservationInput = {
    title?: string
    textValue?: string
    detail?: string
    observedAt?: string
    excluded?: boolean
    version: number
}

export async function createObservation(input: CreateObservationInput) {
    const response = await authRequest('/api/observations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Observation could not be saved')
}

export async function updateObservation(id: string, input: UpdateObservationInput): Promise<void> {
    const response = await authRequest(`/api/observations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
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
): Promise<NumericObservation[]> {
    const query = new URLSearchParams()
    if (range.from) query.set('from', range.from)
    if (range.to) query.set('to', range.to)
    if (range.definitionIds?.length) query.set('definitionIds', range.definitionIds.join(','))
    return (
        await sharedJsonRequest<{ data: NumericObservation[] }>(
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

export async function setObservationExcluded(observation: NumericObservation, excluded: boolean) {
    const response = await authRequest(`/api/observations/${observation.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ excluded, version: observation.version }),
    })
    if (!response.ok) throw new Error('Could not update observation')
    return ((await response.json()) as { data: NumericObservation }).data
}
