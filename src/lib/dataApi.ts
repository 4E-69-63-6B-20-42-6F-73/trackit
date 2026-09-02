import type { paths } from './api.generated'
import { apiClient } from './apiClient'
import { invalidateAllServerDataQueries } from './serverQueries'

export type MaintenanceDateRange =
    paths['/api/data/rebuild-projections']['post']['requestBody']['content']['application/json']
export type MaintenanceRederiveRequest =
    paths['/api/data/rederive-observations']['post']['requestBody']['content']['application/json']

const maintenanceError = (
    response: Response,
    error: { error: string; requestId?: string } | undefined,
) => {
    const details = [
        `HTTP ${response.status}`,
        error?.error,
        error?.requestId ? `request ${error.requestId}` : undefined,
    ]
        .filter(Boolean)
        .join(' · ')
    return new Error(details || 'Data maintenance request failed.')
}

export async function rebuildProjections(range: MaintenanceDateRange = {}) {
    const { data, error, response } = await apiClient.POST('/api/data/rebuild-projections', {
        body: range,
    })
    if (!response.ok) throw maintenanceError(response, error)
    if (!data) throw new Error('Data maintenance response was invalid.')
    await invalidateAllServerDataQueries()
    return data.data
}

export async function rederiveObservations(input: MaintenanceRederiveRequest = {}) {
    const { data, error, response } = await apiClient.POST('/api/data/rederive-observations', {
        body: input,
    })
    if (!response.ok) throw maintenanceError(response, error)
    if (!data) throw new Error('Data maintenance response was invalid.')
    await invalidateAllServerDataQueries()
    return data.data
}

export async function deleteOwnerData(confirmation: string) {
    const { response } = await apiClient.POST('/api/data/delete-owner', {
        body: { confirmation: confirmation as 'DELETE ALL TRACKIT DATA' },
    })
    if (!response.ok) throw new Error('Enter the confirmation phrase exactly.')
    await invalidateAllServerDataQueries()
}
