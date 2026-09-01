import { useEffect, useState } from 'react'
import {
    Alert,
    Button,
    Group,
    Modal,
    Progress,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
    updatePreferences,
    type ExperiencePreferences,
    type Preferences,
} from '../lib/preferencesApi'
import { useServerData } from '../hooks/useServerData'

type SaveKind = 'experience' | 'profile'

export function Onboarding() {
    const navigate = useNavigate()
    const { preferences: sharedPreferences, loading, unavailable } = useServerData()
    const [preferences, setPreferences] = useState<Preferences | null>(sharedPreferences)
    const [step, setStep] = useState(0)
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale
    const timezones =
        typeof Intl.supportedValuesOf === 'function'
            ? Intl.supportedValuesOf('timeZone')
            : [detectedTimezone]
    const locales = [...new Set([detectedLocale, 'en-US', 'en-GB', 'nl-NL', 'de-DE', 'fr-FR'])]

    const saveMutation = useMutation({
        mutationFn: ({ update }: { kind: SaveKind; update: Parameters<typeof updatePreferences>[0] }) =>
            updatePreferences(update),
        onSuccess: saved => setPreferences(saved),
    })

    useEffect(() => {
        queueMicrotask(() => {
            if (!sharedPreferences) return
            setPreferences(sharedPreferences)
            setStep(Math.min(sharedPreferences.experience?.onboardingStep ?? 0, 2))
        })
    }, [sharedPreferences])

    if (loading || preferences?.experience?.onboardingComplete) return null

    const saveExperience = async (next: ExperiencePreferences) => {
        if (!preferences) return false
        saveMutation.reset()
        try {
            await saveMutation.mutateAsync({
                kind: 'experience',
                update: { experience: { ...preferences.experience, ...next } },
            })
            return true
        } catch {
            return false
        }
    }

    const saveProfile = async () => {
        if (!preferences) return
        saveMutation.reset()
        try {
            await saveMutation.mutateAsync({
                kind: 'profile',
                update: {
                    displayName: preferences.displayName,
                    timezone: preferences.timezone,
                    locale: preferences.locale,
                    experience: { ...preferences.experience, onboardingStep: 2 },
                },
            })
            setStep(2)
        } catch {
            return
        }
    }

    const finish = async () => saveExperience({ onboardingStep: 3, onboardingComplete: true })
    const skip = async () => {
        if (await finish()) navigate('/today')
    }
    const startLogging = async () => {
        if (!(await finish())) return
        navigate('/today')
        window.setTimeout(() => window.dispatchEvent(new Event('trackit:open-log-menu')), 0)
    }
    const connectSource = async () => {
        if (await finish()) navigate('/settings/connections')
    }

    const error = !preferences && unavailable
        ? 'TrackIt could not load setup from your server.'
        : saveMutation.isError
          ? saveMutation.variables?.kind === 'profile'
              ? 'Your profile could not be saved to the server.'
              : 'Setup could not be saved to your server. Nothing was stored in this browser.'
          : ''
    const saving = saveMutation.isPending

    return (
        <Modal
            opened
            onClose={() => void skip()}
            closeOnClickOutside={false}
            closeOnEscape
            withCloseButton
            closeButtonProps={{ 'aria-label': 'Skip setup' }}
            centered
            size="lg"
            title={<Text fw={750}>Set up TrackIt</Text>}
        >
            <Progress
                value={((step + 1) / 3) * 100}
                mb="lg"
                aria-label={`Setup step ${step + 1} of 3`}
            />
            {error && (
                <Alert color="orange" mb="md">
                    {error}
                    {!preferences && (
                        <Button
                            onClick={() =>
                                window.dispatchEvent(new Event('trackit:preferences-changed'))
                            }
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
                                TrackIt keeps the observations you log or import on the TrackIt
                                server you control, then turns them into Today, Journal, Trends, and
                                Goals.
                            </Text>
                            <ul>
                                <li>Manual logging works without a connected phone</li>
                                <li>Connections can import observations when you want them</li>
                                <li>Foods, recipes, and metric definitions live in Library</li>
                            </ul>
                        </div>
                    )}
                    {step === 1 && (
                        <Stack>
                            <div>
                                <h2>Set your profile context</h2>
                                <Text c="dimmed" size="sm">
                                    Timezone controls day boundaries. Locale controls dates and
                                    number formatting.
                                </Text>
                            </div>
                            <TextInput
                                label="Display name"
                                value={preferences.displayName}
                                onChange={event =>
                                    setPreferences({
                                        ...preferences,
                                        displayName: event.currentTarget.value,
                                    })
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
                                onChange={locale =>
                                    locale && setPreferences({ ...preferences, locale })
                                }
                            />
                        </Stack>
                    )}
                    {step === 2 && (
                        <Stack gap="md">
                            <div className="onboarding-intro">
                                <Text className="eyebrow teal-text">READY</Text>
                                <h2>Choose how you want to start.</h2>
                                <Text c="dimmed">
                                    You can log something yourself, connect a source, or go straight
                                    to Today and do either later.
                                </Text>
                            </div>
                            <Group grow align="stretch">
                                <Button size="md" onClick={() => void startLogging()} loading={saving}>
                                    Log something
                                </Button>
                                <Button
                                    size="md"
                                    variant="default"
                                    onClick={() => void connectSource()}
                                    disabled={saving}
                                >
                                    Connect a source
                                </Button>
                            </Group>
                        </Stack>
                    )}
                    <Group justify="space-between">
                        <Group gap="xs">
                            <Button
                                variant="subtle"
                                color="gray"
                                disabled={step === 0 || saving}
                                onClick={() => setStep(value => Math.max(0, value - 1))}
                            >
                                Back
                            </Button>
                            <Button
                                variant="subtle"
                                color="gray"
                                loading={saving}
                                onClick={() => void skip()}
                            >
                                Skip setup
                            </Button>
                        </Group>
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
                            <Button
                                variant="subtle"
                                color="trackit"
                                loading={saving}
                                onClick={() => void skip()}
                            >
                                Go to Today
                            </Button>
                        )}
                    </Group>
                </Stack>
            )}
        </Modal>
    )
}
