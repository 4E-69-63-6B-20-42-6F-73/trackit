import { authRequest } from './authApi'

export type MaintenanceDateRange = { from?: string; to?: string }

const postMaintenance = async <T>(path: string, range: MaintenanceDateRange) => {
    const response = await authRequest(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(range),
    })
    if (!response.ok) throw new Error('Data maintenance request failed.')
    const body = (await response.json()) as { data: T }
    return body.data
}

export async function rebuildProjections(range: MaintenanceDateRange = {}) {
    return postMaintenance<{ queuedDates: number }>('/api/data/rebuild-projections', range)
}

export async function rederiveObservations(range: MaintenanceDateRange = {}) {
    return postMaintenance<{
        sourceRecords: number
        canonicalObservations: number
        queuedProjectionDates: number
    }>('/api/data/rederive-observations', range)
}

export async function deleteOwnerData(confirmation: string) {
    const response = await authRequest('/api/data/delete-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation }),
    })
    if (!response.ok) throw new Error('Enter the confirmation phrase exactly.')
}
