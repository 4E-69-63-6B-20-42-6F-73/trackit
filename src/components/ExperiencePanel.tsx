import { useState } from 'react'
import {
    Alert,
    Button,
    Checkbox,
    Group,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core'
import { updatePreferences, type ExperiencePreferences } from '../lib/preferencesApi'
import { useServerData } from '../hooks/useServerData'

const reminderKinds = ['Meal', 'Water', 'Weight', 'Check-in', 'Symptom', 'Note'] as const

export function ExperiencePanel() {
    const { preferences } = useServerData()
    const [label, setLabel] = useState('Evening check-in')
    const [kind, setKind] = useState<(typeof reminderKinds)[number]>('Check-in')
    const [time, setTime] = useState('20:00')
    const [message, setMessage] = useState('')
    const [saving, setSaving] = useState(false)

    const save = async (experience: ExperiencePreferences, success: string) => {
        if (!preferences) return
        setSaving(true)
        setMessage('')
        try {
            await updatePreferences({ experience })
            setMessage(success)
        } catch {
            setMessage('Changes could not be saved to your server.')
        } finally {
            setSaving(false)
        }
    }

    if (!preferences) return message ? <Alert color="orange">{message}</Alert> : null
    const experience = preferences.experience ?? {}
    const reminders = experience.reminders ?? []
    const routines = experience.routines ?? []

    return (
        <Stack gap="xl">
            {message && (
                <Alert color={message.includes('could not') ? 'orange' : 'teal'}>{message}</Alert>
            )}
            <section>
                <Text fw={700}>Calm reminders</Text>
                <Text size="sm" c="dimmed" mb="md">
                    Reminders appear inside TrackIt when their time arrives. TrackIt does not use
                    browser storage or send push data to third parties.
                </Text>
                <Group align="end">
                    <TextInput
                        label="Label"
                        value={label}
                        onChange={event => setLabel(event.currentTarget.value)}
                    />
                    <Select
                        label="Action"
                        value={kind}
                        data={[...reminderKinds]}
                        onChange={value => value && setKind(value as typeof kind)}
                    />
                    <TextInput
                        type="time"
                        label="Time"
                        value={time}
                        onChange={event => setTime(event.currentTarget.value)}
                    />
                    <Button
                        loading={saving}
                        disabled={!label.trim()}
                        onClick={() =>
                            void save(
                                {
                                    ...experience,
                                    reminders: [
                                        ...reminders,
                                        {
                                            id: crypto.randomUUID(),
                                            label: label.trim(),
                                            kind,
                                            time,
                                            enabled: true,
                                        },
                                    ],
                                },
                                'Reminder saved.',
                            )
                        }
                    >
                        Add reminder
                    </Button>
                </Group>
                <Stack gap="xs" mt="md">
                    {reminders.map(reminder => (
                        <div className="preference-row" key={reminder.id}>
                            <div>
                                <Text fw={600}>{reminder.label}</Text>
                                <Text size="sm" c="dimmed">
                                    {reminder.time} Â· {reminder.kind}
                                </Text>
                            </div>
                            <Group>
                                <Switch
                                    checked={reminder.enabled}
                                    aria-label={`Enable ${reminder.label}`}
                                    onChange={event =>
                                        void save(
                                            {
                                                ...experience,
                                                reminders: reminders.map(item =>
                                                    item.id === reminder.id
                                                        ? {
                                                              ...item,
                                                              enabled: event.currentTarget.checked,
                                                          }
                                                        : item,
                                                ),
                                            },
                                            'Reminder updated.',
                                        )
                                    }
                                />
                                <Button
                                    size="compact-sm"
                                    variant="subtle"
                                    color="gray"
                                    onClick={() =>
                                        void save(
                                            {
                                                ...experience,
                                                reminders: reminders.filter(
                                                    item => item.id !== reminder.id,
                                                ),
                                            },
                                            'Reminder removed.',
                                        )
                                    }
                                >
                                    Remove
                                </Button>
                            </Group>
                        </div>
                    ))}
                </Stack>
            </section>
            <section>
                <Text fw={700}>Check-in routines</Text>
                <Text size="sm" c="dimmed" mb="md">
                    Group common records so a routine provides a consistent prompt without streaks
                    or pressure.
                </Text>
                {routines.length === 0 ? (
                    <Button
                        variant="default"
                        onClick={() =>
                            void save(
                                {
                                    ...experience,
                                    routines: [
                                        {
                                            id: crypto.randomUUID(),
                                            name: 'Morning check-in',
                                            kinds: ['Weight', 'Check-in', 'Symptom', 'Note'],
                                        },
                                    ],
                                },
                                'Morning routine added.',
                            )
                        }
                    >
                        Add morning routine
                    </Button>
                ) : (
                    routines.map(routine => (
                        <div className="preference-row" key={routine.id}>
                            <div>
                                <Text fw={600}>{routine.name}</Text>
                                <Text size="sm" c="dimmed">
                                    {routine.kinds.join(', ')}
                                </Text>
                            </div>
                            <Button
                                size="compact-sm"
                                variant="subtle"
                                color="gray"
                                onClick={() =>
                                    void save(
                                        {
                                            ...experience,
                                            routines: routines.filter(
                                                item => item.id !== routine.id,
                                            ),
                                        },
                                        'Routine removed.',
                                    )
                                }
                            >
                                Remove
                            </Button>
                        </div>
                    ))
                )}
            </section>
            <Checkbox
                checked={experience.dataMode === 'manual'}
                readOnly
                label="Manual tracking remains available without a connected device"
            />
        </Stack>
    )
}
