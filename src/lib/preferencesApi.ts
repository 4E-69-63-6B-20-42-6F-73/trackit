import { authRequest } from './authApi'

export type Preferences = {
    displayName: string
    timezone: string
    locale: string
    units: 'metric' | 'imperial'
}

export async function getPreferences(): Promise<Preferences> {
    const response = await authRequest('/api/preferences')
    if (!response.ok) throw new Error('Preferences unavailable')
    return ((await response.json()) as { data: Preferences }).data
}

export async function updatePreferences(input: Preferences): Promise<Preferences> {
    const response = await authRequest('/api/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Preferences could not be saved')
    return ((await response.json()) as { data: Preferences }).data
}
