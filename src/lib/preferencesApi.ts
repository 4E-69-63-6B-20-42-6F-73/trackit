import type { MetricPreferences } from '@trackit/domain/metrics'
import { authRequest } from './authApi'

export type Preferences = {
    displayName: string
    timezone: string
    locale: string
    metricPreferences?: MetricPreferences
    experience?: ExperiencePreferences
}

export type ExperiencePreferences = {
    onboardingStep?: number
    onboardingComplete?: boolean
    dismissedWeeklyReflection?: string
}

export async function getPreferences(signal?: AbortSignal): Promise<Preferences> {
    const response = await authRequest('/api/preferences', { signal })
    if (!response.ok) throw new Error('Preferences unavailable')
    return ((await response.json()) as { data: Preferences }).data
}
export async function updatePreferences(input: Partial<Preferences>): Promise<Preferences> {
    const response = await authRequest('/api/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Preferences could not be saved')
    const saved = ((await response.json()) as { data: Preferences }).data
    window.dispatchEvent(new CustomEvent('trackit:preferences-saved', { detail: saved }))
    return saved
}
