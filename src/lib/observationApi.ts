import type { NumericObservation } from '../domain/health'
import { $api, apiClient } from './apiClient'
import type { components } from './api.generated'
import { queryClient } from './queryClient'

export type MetricSourceSummary = components['schemas']['MetricSourceSummary']
export type CreateObservationInput = components['schemas']['CreateObservation']
export type UpdateObservationInput = components['schemas']['UpdateObservation']

const observationParams = (range: {
    from?: string
    to?: string
    definitionIds?: string[]
}) => ({
    params: {
        query: {
            from: range.from,
            to: range.to,
            definitionIds: range.definitionIds?.join(','),
        },
    },
})

const invalidateObservationQueries = async () => {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['get', '/api/observations'] }),
        queryClient.invalidateQueries({ queryKey: ['get', '/api/metric-sources'] }),
    ])
}

export async function createObservation(input: CreateObservationInput) {
    const { response } = await apiClient.POST('/api/observations', { body: input })
    if (!response.ok) throw new Error('Observation could not be saved')
    await invalidateObservationQueries()
}

export async function updateObservation(id: string, input: UpdateObservationInput): Promise<void> {
    const { response } = await apiClient.PATCH('/api/observations/{id}', {
        params: { path: { id } },
        body: input,
    })
    if (!response.ok) throw new Error(`Observation update failed (${response.status})`)
    await invalidateObservationQueries()
}

export async function deleteObservation(id: string): Promise<void> {
    const { response } = await apiClient.DELETE('/api/observations/{id}', {
        params: { path: { id } },
    })
    if (!response.ok && response.status !== 404)
        throw new Error(`Observation delete failed (${response.status})`)
    await invalidateObservationQueries()
}

export async function listObservations(
    range: { from?: string; to?: string; definitionIds?: string[] } = {},
    signal?: AbortSignal,
): Promise<NumericObservation[]> {
    const options = observationParams(range)
    if (signal) {
        const { data, response } = await apiClient.GET('/api/observations', {
            ...options,
            signal,
        })
        if (!response.ok || !data) throw new Error('Observations could not be loaded')
        return data.data
    }
    const result = await queryClient.fetchQuery(
        $api.queryOptions('get', '/api/observations', options),
    )
    return result.data
}

export async function listMetricSources(signal?: AbortSignal): Promise<MetricSourceSummary[]> {
    if (signal) {
        const { data, response } = await apiClient.GET('/api/metric-sources', { signal })
        if (!response.ok || !data) throw new Error('Metric sources could not be loaded')
        return data.data
    }
    const result = await queryClient.fetchQuery($api.queryOptions('get', '/api/metric-sources'))
    return result.data
}

export async function setObservationExcluded(observation: NumericObservation, excluded: boolean) {
    const { data, response } = await apiClient.PATCH('/api/observations/{id}', {
        params: { path: { id: observation.id } },
        body: { excluded, version: observation.version },
    })
    if (!response.ok) throw new Error('Could not update observation')
    await invalidateObservationQueries()
    return data?.data as NumericObservation
}
