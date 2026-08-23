import { useEffect, useState } from 'react'
import {
    Alert,
    Button,
    Checkbox,
    Group,
    Modal,
    Progress,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useNavigate } from 'react-router-dom'
import {
    getPreferences,
    updatePreferences,
    type ExperiencePreferences,
    type FocusArea,
    type Preferences,
} from '../lib/preferencesApi'

const focusOptions: Array<{ value: FocusArea; label: string; description: string }> = [
    { value: 'energy', label: 'Energy', description: 'Understand how you feel across the day.' },
    { value: 'nutrition', label: 'Nutrition', description: 'Keep meals and nutrients in context.' },
    { value: 'sleep', label: 'Sleep', description: 'Follow sleep duration and related patterns.' },
    { value: 'movement', label: 'Movement', description: 'See activity and exercise over time.' },
    { value: 'body', label: 'Body metrics', description: 'Track weight and measurements.' },
    { value: 'collect', label: 'Just collect for now', description: 'Keep the dashboard broad.' },
]

const cardsForFocus = (areas: FocusArea[]) => {
    if (areas.includes('collect') || areas.length === 0)
        return ['sleep', 'heart', 'energy', 'weight', 'progress', 'trend', 'journal'] as const
    const cards = new Set<
        'sleep' | 'heart' | 'energy' | 'weight' | 'progress' | 'trend' | 'journal'
    >(['journal', 'trend'])
    if (areas.includes('sleep')) cards.add('sleep')
    if (areas.includes('energy')) cards.add('energy')
    if (areas.includes('movement')) {
        cards.add('heart')
        cards.add('progress')
    }
    if (areas.includes('nutrition')) cards.add('progress')
    if (areas.includes('body')) cards.add('weight')
    return [...cards]
}

export function Onboarding() {
    const navigate = useNavigate()
    const [preferences, setPreferences] = useState<Preferences | null>(null)
    const [step, setStep] = useState(0)
    const [focusAreas, setFocusAreas] = useState<FocusArea[]>(['collect'])
    const [dataMode, setDataMode] = useState<'manual' | 'health-connect' | 'hybrid'>('manual')
    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const load = () => {
        void getPreferences()
            .then(value => {
                setPreferences(value)
                setStep(value.experience?.onboardingStep ?? 0)
                setFocusAreas(value.experience?.focusAreas ?? ['collect'])
                setDataMode(value.experience?.dataMode ?? 'manual')
            })
            .catch(() => setError('TrackIt could not load setup from your server.'))
            .finally(() => setLoading(false))
    }

    useEffect(load, [])

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
            window.dispatchEvent(new Event('trackit:preferences-changed'))
            return true
        } catch {
            setError('Setup could not be saved to your server. Nothing was stored in this browser.')
            return false
        } finally {
            setSaving(false)
        }
    }

    const advance = async () => {
        const nextStep = Math.min(4, step + 1)
        if (
            await saveExperience({
                onboardingStep: nextStep,
                focusAreas,
                dataMode,
                visibleCards: [...cardsForFocus(focusAreas)],
            })
        )
            setStep(nextStep)
    }

    const finish = async () => {
        if (
            await saveExperience({
                onboardingStep: 5,
                onboardingComplete: true,
                focusAreas,
                dataMode,
                visibleCards: [...cardsForFocus(focusAreas)],
            })
        ) {
            if (dataMode !== 'manual') navigate('/connections/devices')
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
                units: preferences.units,
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
            <Progress
                value={((step + 1) / 5) * 100}
                mb="lg"
                aria-label={`Setup step ${step + 1} of 5`}
            />
            {error && (
                <Alert color="orange" mb="md">
                    {error}
                    {!preferences && (
                        <Button
                            onClick={() => {
                                setLoading(true)
                                setError('')
                                load()
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
                            <h2>Your health data, on your server.</h2>
                            <Text c="dimmed">
                                TrackIt keeps records under your control, shows where values came
                                from, and never requires a cloud health account.
                            </Text>
                            <ul>
                                <li>No telemetry by default</li>
                                <li>Manual tracking works without a connected phone</li>
                                <li>Setup progress is saved only on your TrackIt server</li>
                            </ul>
                        </div>
                    )}
                    {step === 1 && (
                        <Stack>
                            <div>
                                <h2>Make dates and measurements yours</h2>
                                <Text c="dimmed" size="sm">
                                    These choices can be changed later in Settings.
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
                                label="Measurement system"
                                value={preferences.units}
                                data={[
                                    { value: 'metric', label: 'Metric' },
                                    { value: 'imperial', label: 'Imperial' },
                                ]}
                                onChange={value =>
                                    value &&
                                    setPreferences({
                                        ...preferences,
                                        units: value as 'metric' | 'imperial',
                                    })
                                }
                            />
                        </Stack>
                    )}
                    {step === 2 && (
                        <div>
                            <h2>What matters to you?</h2>
                            <Text c="dimmed" size="sm" mb="md">
                                This arranges your dashboard. It does not request access or make
                                medical assumptions.
                            </Text>
                            <div className="focus-grid">
                                {focusOptions.map(option => (
                                    <Checkbox.Card
                                        key={option.value}
                                        checked={focusAreas.includes(option.value)}
                                        onClick={() =>
                                            setFocusAreas(current =>
                                                current.includes(option.value)
                                                    ? current.filter(
                                                          value => value !== option.value,
                                                      )
                                                    : [
                                                          ...current.filter(
                                                              value => value !== 'collect',
                                                          ),
                                                          option.value,
                                                      ],
                                            )
                                        }
                                        className="focus-option"
                                    >
                                        <Text fw={650}>{option.label}</Text>
                                        <Text size="sm" c="dimmed">
                                            {option.description}
                                        </Text>
                                    </Checkbox.Card>
                                ))}
                            </div>
                        </div>
                    )}
                    {step === 3 && (
                        <div>
                            <h2>How do you want to add data?</h2>
                            <Text c="dimmed" size="sm" mb="md">
                                Manual-only mode is complete. You can connect Android later.
                            </Text>
                            <SegmentedControl
                                fullWidth
                                value={dataMode}
                                onChange={value => setDataMode(value as typeof dataMode)}
                                data={[
                                    { value: 'manual', label: 'Manual only' },
                                    { value: 'health-connect', label: 'Health Connect' },
                                    { value: 'hybrid', label: 'Both' },
                                ]}
                            />
                            <Alert mt="md" color="teal" variant="light">
                                {dataMode === 'manual'
                                    ? 'Start with check-ins, meals, water, weight, symptoms, and notes. No phone is required.'
                                    : 'After setup, TrackIt guides pairing and shows exactly which categories sync.'}
                            </Alert>
                        </div>
                    )}
                    {step === 4 && (
                        <div className="onboarding-intro">
                            <Text className="eyebrow teal-text">READY</Text>
                            <h2>Your dashboard is prepared.</h2>
                            <Text c="dimmed">
                                Start with one small record. TrackIt becomes more useful as your own
                                history grows.
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
                        {step === 1 ? (
                            <Button loading={saving} onClick={() => void saveProfile()}>
                                Save and continue
                            </Button>
                        ) : step < 4 ? (
                            <Button loading={saving} onClick={() => void advance()}>
                                Continue
                            </Button>
                        ) : (
                            <Button loading={saving} onClick={() => void finish()}>
                                {dataMode === 'manual'
                                    ? 'Start tracking'
                                    : 'Continue to connection'}
                            </Button>
                        )}
                    </Group>
                </Stack>
            )}
        </Modal>
    )
}
