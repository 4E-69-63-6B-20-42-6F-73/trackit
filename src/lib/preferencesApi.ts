import { authRequest } from './authApi'

export type Preferences = {
    displayName: string
    timezone: string
    locale: string
    units: 'metric' | 'imperial'
    experience?: ExperiencePreferences
}

export type FocusArea = 'energy' | 'nutrition' | 'sleep' | 'movement' | 'body' | 'collect'
export type DashboardCard =
    'sleep' | 'heart' | 'energy' | 'weight' | 'progress' | 'trend' | 'journal'
export type ExperiencePreferences = {
    onboardingStep?: number
    onboardingComplete?: boolean
    dataMode?: 'manual' | 'health-connect' | 'hybrid'
    focusAreas?: FocusArea[]
    visibleCards?: DashboardCard[]
    reminders?: Array<{
        id: string
        label: string
        kind: 'Meal' | 'Water' | 'Weight' | 'Check-in' | 'Symptom' | 'Note'
        time: string
        enabled: boolean
    }>
    routines?: Array<{
        id: string
        name: string
        kinds: Array<'Water' | 'Weight' | 'Check-in' | 'Symptom' | 'Note'>
    }>
    experiments?: Array<{
        id: string
        question: string
        primaryMetric: string
        comparisonMetric?: string
        startedAt: string
        endedAt?: string
        status: 'active' | 'completed'
    }>
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
