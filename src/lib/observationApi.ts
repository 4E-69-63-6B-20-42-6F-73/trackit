import type { NumericObservation } from '@trackit/domain/health'
import { $api, apiClient } from './apiClient'
import type { paths } from './api.generated'
import { queryClient } from './queryClient'
import { invalidateObservationQueries } from './serverQueries'

export type MetricSourceSummary =
    paths['/api/metric-sources']['get']['responses'][200]['content']['application/json']['data'][number]
export type CreateObservationInput =
    paths['/api/observations']['post']['requestBody']['content']['application/json']
export type UpdateObservationInput =
    paths['/api/observations/{id}']['patch']['requestBody']['content']['application/json']

const observationParams = (range: { from?: string; to?: string; definitionIds?: string[] }) => ({
    params: {
        query: {
            from: range.from,
            to: range.to,
            definitionIds: range.definitionIds?.join(','),
        },
    },
})

export const observationQueryOptions = (
    range: { from?: string; to?: string; definitionIds?: string[] } = {},
) => $api.queryOptions('get', '/api/observations', observationParams(range))

export const metricSourcesQueryOptions = () => $api.queryOptions('get', '/api/metric-sources')

export async function createObservation(input: CreateObservationInput) {
    const { data, response } = await apiClient.POST('/api/observations', { body: input })
    if (!response.ok || !data) throw new Error('Observation could not be saved')
    await invalidateObservationQueries()
    return data.data
}

export async function updateObservation(id: string, input: UpdateObservationInput) {
    const { data, response } = await apiClient.PATCH('/api/observations/{id}', {
        params: { path: { id } },
        body: input,
    })
    if (!response.ok || !data) throw new Error(`Observation update failed (${response.status})`)
    await invalidateObservationQueries()
    return data.data
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
    const result = await queryClient.fetchQuery(observationQueryOptions(range))
    return result.data
}

export async function listMetricSources(signal?: AbortSignal): Promise<MetricSourceSummary[]> {
    if (signal) {
        const { data, response } = await apiClient.GET('/api/metric-sources', { signal })
        if (!response.ok || !data) throw new Error('Metric sources could not be loaded')
        return data.data
    }
    const result = await queryClient.fetchQuery(metricSourcesQueryOptions())
    return result.data
}

export async function setObservationExcluded(observation: NumericObservation, excluded: boolean) {
    const { data, response } = await apiClient.PATCH('/api/observations/{id}', {
        params: { path: { id: observation.id } },
        body: { excluded, version: observation.version },
    })
    if (!response.ok || !data) throw new Error('Could not update observation')
    await invalidateObservationQueries()
    return data.data
}
