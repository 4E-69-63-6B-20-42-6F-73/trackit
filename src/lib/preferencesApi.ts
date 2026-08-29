import { authRequest } from './authApi'
import { preferencesForPreset, type MetricPreferences } from '../domain/metrics'

export type Preferences = {
    displayName: string
    timezone: string
    locale: string
    /** Internal Metric Center preset state; there is no standalone Units settings surface. */
    units: 'metric' | 'imperial'
    metricPreferences?: MetricPreferences
    experience?: ExperiencePreferences
}

/** @deprecated Remove with the remaining Today dashboard customization UI. */
export type DashboardCard =
    | 'sleep'
    | 'heart'
    | 'energy'
    | 'weight'
    | 'progress'
    | 'trend'
    | 'journal'

/** @deprecated Remove with the remaining manual-entry routine UI. */
export type LegacyRoutine = {
    id: string
    name: string
    kinds: Array<'Water' | 'Weight' | 'Check-in' | 'Symptom' | 'Note'>
}

export type ExperiencePreferences = {
    onboardingStep?: number
    onboardingComplete?: boolean
    dismissedWeeklyReflection?: string
    /** @deprecated No longer persisted by the server. */
    visibleCards?: DashboardCard[]
    /** @deprecated No longer persisted by the server. */
    routines?: LegacyRoutine[]
}

export async function getPreferences(signal?: AbortSignal): Promise<Preferences> {
    const response = await authRequest('/api/preferences', { signal })
    if (!response.ok) throw new Error('Preferences unavailable')
    const preferences = ((await response.json()) as { data: Preferences }).data
    if (preferences.metricPreferences) return preferences
    const migrated = { metricPreferences: preferencesForPreset(preferences.units ?? 'metric') }
    const migrationResponse = await authRequest('/api/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(migrated),
        signal,
    })
    if (!migrationResponse.ok) return { ...preferences, ...migrated }
    return ((await migrationResponse.json()) as { data: Preferences }).data
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
