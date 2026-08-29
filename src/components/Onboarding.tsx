import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, Progress, Select, Stack, Text, TextInput } from '@mantine/core'
import { updatePreferences, type ExperiencePreferences, type Preferences } from '../lib/preferencesApi'
import { useServerData } from '../hooks/useServerData'

export function Onboarding() {
    const { preferences: sharedPreferences, loading, unavailable } = useServerData()
    const [preferences, setPreferences] = useState<Preferences | null>(sharedPreferences)
    const [step, setStep] = useState(0)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale
    const timezones =
        typeof Intl.supportedValuesOf === 'function'
            ? Intl.supportedValuesOf('timeZone')
            : [detectedTimezone]
    const locales = [...new Set([detectedLocale, 'en-US', 'en-GB', 'nl-NL', 'de-DE', 'fr-FR'])]

    useEffect(() => {
        queueMicrotask(() => {
            if (!sharedPreferences) {
                if (unavailable) setError('TrackIt could not load setup from your server.')
                return
            }
            setError('')
            setPreferences(sharedPreferences)
            setStep(Math.min(sharedPreferences.experience?.onboardingStep ?? 0, 2))
        })
    }, [sharedPreferences, unavailable])

    if (loading || preferences?.experience?.onboardingComplete) return null

    const saveExperience = async (next: ExperiencePreferences) => {
        if (!preferences) return false
        setSaving(true)
        setError('')
        try {
            const saved = await updatePreferences({
                experience: { ...preferences.experience, ...next },
            })
            setPreferences(saved)
            return true
        } catch {
            setError('Setup could not be saved to your server. Nothing was stored in this browser.')
            return false
        } finally {
            setSaving(false)
        }
    }

    const saveProfile = async () => {
        if (!preferences) return
        setSaving(true)
        setError('')
        try {
            const saved = await updatePreferences({
                displayName: preferences.displayName,
                timezone: preferences.timezone,
                locale: preferences.locale,
                experience: { ...preferences.experience, onboardingStep: 2 },
            })
            setPreferences(saved)
            setStep(2)
        } catch {
            setError('Your profile could not be saved to the server.')
        } finally {
            setSaving(false)
        }
    }

    const finish = async () => {
        if (await saveExperience({ onboardingStep: 3, onboardingComplete: true })) setStep(3)
    }

    return (
        <Modal
            opened
            onClose={() => undefined}
            closeOnClickOutside={false}
            closeOnEscape={false}
            withCloseButton={false}
            centered
            size="lg"
            title={<Text fw={750}>Set up TrackIt</Text>}
        >
            <Progress value={((step + 1) / 3) * 100} mb="lg" aria-label={`Setup step ${step + 1} of 3`} />
            {error && (
                <Alert color="orange" mb="md">
                    {error}
                    {!preferences && (
                        <Button
                            onClick={() => {
                                setError('')
                                window.dispatchEvent(new Event('trackit:preferences-changed'))
                            }}
                            size="xs"
                            ml="sm"
                        >
                            Retry
                        </Button>
                    )}
                </Alert>
            )}
            {preferences && (
                <Stack gap="lg">
                    {step === 0 && (
                        <div className="onboarding-intro">
                            <Text className="eyebrow teal-text">PRIVATE BY CONSTRUCTION</Text>
                            <h2>Your health observations, on your server.</h2>
                            <Text c="dimmed">
                                TrackIt records observations from you and connected sources, then turns them into Today, Journal, Trends, and Goals.
                            </Text>
                            <ul>
                                <li>Manual logging works without a connected phone</li>
                                <li>Health Connect can be paired whenever you want</li>
                                <li>Foods, recipes, and metric definitions live in Library</li>
                            </ul>
                        </div>
                    )}
                    {step === 1 && (
                        <Stack>
                            <div>
                                <h2>Set your profile context</h2>
                                <Text c="dimmed" size="sm">
                                    Timezone controls day boundaries. Locale controls dates and number formatting.
                                </Text>
                            </div>
                            <TextInput
                                label="Display name"
                                value={preferences.displayName}
                                onChange={event =>
                                    setPreferences({ ...preferences, displayName: event.currentTarget.value })
                                }
                            />
                            <Select
                                label="Timezone"
                                value={preferences.timezone}
                                data={timezones}
                                searchable
                                onChange={timezone =>
                                    timezone && setPreferences({ ...preferences, timezone })
                                }
                            />
                            <Select
                                label="Locale"
                                value={preferences.locale}
                                data={locales}
                                searchable
                                onChange={locale => locale && setPreferences({ ...preferences, locale })}
                            />
                        </Stack>
                    )}
                    {step === 2 && (
                        <div className="onboarding-intro">
                            <Text className="eyebrow teal-text">READY</Text>
                            <h2>Start with one observation.</h2>
                            <Text c="dimmed">
                                Use Log for measurements, meals, symptoms, or notes. Connect Health Connect later from Connections if you want imported observations too.
                            </Text>
                        </div>
                    )}
                    <Group justify="space-between">
                        <Button
                            variant="subtle"
                            color="gray"
                            disabled={step === 0 || saving}
                            onClick={() => setStep(value => Math.max(0, value - 1))}
                        >
                            Back
                        </Button>
                        {step === 0 ? (
                            <Button
                                loading={saving}
                                onClick={async () => {
                                    if (await saveExperience({ onboardingStep: 1 })) setStep(1)
                                }}
                            >
                                Continue
                            </Button>
                        ) : step === 1 ? (
                            <Button loading={saving} onClick={() => void saveProfile()}>
                                Save and continue
                            </Button>
                        ) : (
                            <Button loading={saving} onClick={() => void finish()}>
                                Start tracking
                            </Button>
                        )}
                    </Group>
                </Stack>
            )}
        </Modal>
    )
}
