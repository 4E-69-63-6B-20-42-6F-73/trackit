import { authRequest } from './authApi'

export async function rebuildProjections() {
    const response = await authRequest('/api/data/rebuild-projections', { method: 'POST' })
    if (!response.ok) throw new Error('Projection rebuild could not be queued.')
    const body = (await response.json()) as { data: { queuedDates: number } }
    return body.data
}

export async function deleteOwnerData(confirmation: string) {
    const response = await authRequest('/api/data/delete-owner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation }),
    })
    if (!response.ok) throw new Error('Enter the confirmation phrase exactly.')
}
