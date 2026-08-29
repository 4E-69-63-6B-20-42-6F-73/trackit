import { authRequest } from './authApi'

export type MaintenanceDateRange = { lastDays: number } | { from?: string; to?: string }
export type MaintenanceRederiveRequest = MaintenanceDateRange & { recordTypes?: string[] }

type MaintenanceErrorBody = {
    error?: string
    requestId?: string
}

const postMaintenance = async <T>(
    path: string,
    range: MaintenanceDateRange | MaintenanceRederiveRequest,
) => {
    const response = await authRequest(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(range),
    })
    const body = (await response.json().catch(() => null)) as
        ({ data?: T } & MaintenanceErrorBody) | null
    if (!response.ok) {
        const details = [
            `HTTP ${response.status}`,
            body?.error,
            body?.requestId ? `request ${body.requestId}` : undefined,
        ]
            .filter(Boolean)
            .join(' · ')
        throw new Error(details || 'Data maintenance request failed.')
    }
    if (!body?.data) throw new Error('Data maintenance response was invalid.')
    return body.data
}

export async function rebuildProjections(range: MaintenanceDateRange = {}) {
    return postMaintenance<{ queuedDates: number }>('/api/data/rebuild-projections', range)
}

export async function rederiveObservations(input: MaintenanceRederiveRequest = {}) {
    return postMaintenance<{
        sourceRecords: number
        canonicalObservations: number
        queuedProjectionDates: number
    }>('/api/data/rederive-observations', input)
}

export async function deleteOwnerData(confirmation: string) {
    const response = await authRequest('/api/data/delete-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation }),
    })
    if (!response.ok) throw new Error('Enter the confirmation phrase exactly.')
}
