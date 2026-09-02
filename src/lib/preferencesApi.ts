import type { MetricPreferences } from '@trackit/domain/metrics'
import type { paths } from './api.generated'
import { apiClient } from './apiClient'

type PreferencesApiRecord =
    paths['/api/preferences']['get']['responses'][200]['content']['application/json']['data']
type PreferencesUpdateInput =
    paths['/api/preferences']['patch']['requestBody']['content']['application/json']

export type ExperiencePreferences = NonNullable<PreferencesUpdateInput['experience']>

export type Preferences = {
    displayName: string
    timezone: string
    locale: string
    metricPreferences?: MetricPreferences
    experience?: ExperiencePreferences
}

const toPreferences = (record: PreferencesApiRecord): Preferences => {
    const experience = record.experience
    return {
        displayName: record.displayName,
        timezone: record.timezone,
        locale: record.locale,
        metricPreferences: record.metricPreferences,
        experience: {
            onboardingStep:
                typeof experience.onboardingStep === 'number'
                    ? experience.onboardingStep
                    : undefined,
            onboardingComplete:
                typeof experience.onboardingComplete === 'boolean'
                    ? experience.onboardingComplete
                    : undefined,
            dismissedWeeklyReflection:
                typeof experience.dismissedWeeklyReflection === 'string'
                    ? experience.dismissedWeeklyReflection
                    : undefined,
        },
    }
}

export async function getPreferences(signal?: AbortSignal): Promise<Preferences> {
    const { data, response } = await apiClient.GET('/api/preferences', { signal })
    if (!response.ok || !data) throw new Error('Preferences unavailable')
    return toPreferences(data.data)
}

export async function updatePreferences(input: Partial<Preferences>): Promise<Preferences> {
    const { data, response } = await apiClient.PATCH('/api/preferences', { body: input })
    if (!response.ok || !data) throw new Error('Preferences could not be saved')
    const saved = toPreferences(data.data)
    window.dispatchEvent(new CustomEvent('trackit:preferences-saved', { detail: saved }))
    return saved
}
