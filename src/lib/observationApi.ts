import { environment } from '../app/env'
import type { Observation } from '../domain/health'
import type { JournalEvent } from '../domain/types'
import { authRequest } from './authApi'

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

export async function listObservations(
    range: { from?: string; to?: string } = {},
): Promise<Observation[]> {
    const query = new URLSearchParams(
        Object.entries(range).filter((entry): entry is [string, string] => Boolean(entry[1])),
    )
    const response = await fetch(`${environment.VITE_API_URL}/api/observations?${query}`, {
        credentials: 'same-origin',
    })
    if (!response.ok) throw new Error('Observations unavailable')
    return ((await response.json()) as { data: Observation[] }).data
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
