import { useState } from 'react'
import {
    Button,
    Alert,
    Group,
    Modal,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import type { JournalEvent } from '../domain/types'
import { useServerData } from '../hooks/useServerData'
import { displayUnitFor, toCanonicalMetricValue } from '../domain/metrics'

export type ManualEntryKind = 'Meal' | 'Water' | 'Weight' | 'Check-in' | 'Symptom' | 'Note'

export function ManualEntryLogger({
    opened,
    close,
    add,
    initialKind,
    recentEvents = [],
    selectedDate,
}: {
    opened: boolean
    close: () => void
    add: (event: JournalEvent, allowDuplicate?: boolean) => boolean | void
    initialKind: ManualEntryKind
    recentEvents?: JournalEvent[]
    selectedDate?: string | null
}) {
    const [kind, setKind] = useState<ManualEntryKind>(initialKind)
    const hour = new Date().getHours()
    const [meal, setMeal] = useState(
        hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 21 ? 'Dinner' : 'Snack',
    )
    const [description, setDescription] = useState('')
    const { preferences } = useServerData()
    const weightUnit = displayUnitFor('weight', preferences?.metricPreferences, preferences?.units)
    const waterUnit = displayUnitFor('water', preferences?.metricPreferences, preferences?.units)
    const [amount, setAmount] = useState<number | string>(
        initialKind === 'Weight' ? (weightUnit === 'lb' ? 165 : 75) : 250,
    )
    const [energy, setEnergy] = useState<string | null>('5 · Neutral')
    const [note, setNote] = useState('')
    const [symptom, setSymptom] = useState('')
    const [severity, setSeverity] = useState<number | string>(5)
    const [duration, setDuration] = useState('')
    const [tags, setTags] = useState('')
    const [duplicate, setDuplicate] = useState<JournalEvent | null>(null)
    const routines = preferences?.experience?.routines ?? []
    const [routineQueue, setRoutineQueue] = useState<ManualEntryKind[]>([])
    const [activeRoutine, setActiveRoutine] = useState('')

    const initialDateTime = () => {
        const now = new Date()
        const day = selectedDate ?? now.toISOString().slice(0, 10)
        return `${day}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }
    const [recordedAt, setRecordedAt] = useState(initialDateTime)
    const selectedTimestamp = () => new Date(recordedAt).toISOString()
    const selectedDateLabel = selectedDate
        ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
          })
        : 'today'
    const finish = (event: JournalEvent, allowDuplicate = false) => {
        const result = allowDuplicate ? add(event, true) : add(event)
        if (result === false) {
            setDuplicate(event)
            return
        }
        setDuplicate(null)
        setDescription('')
        setNote('')
        if (routineQueue.length > 0) {
            const [next, ...remaining] = routineQueue
            setKind(next)
            setRoutineQueue(remaining)
        } else {
            setActiveRoutine('')
            close()
        }
    }
    const submit = () => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        const recordedAt = selectedTimestamp()
        let event: JournalEvent
        if (kind === 'Meal')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Meals',
                title: meal,
                detail: description || 'Meal logged',
                source: 'You',
                observedAt: recordedAt,
            }
        else if (kind === 'Water')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Measurements',
                title: 'Water',
                detail: `${amount || 0} ${waterUnit}`,
                source: 'You',
                observedAt: recordedAt,
                observation: {
                    metric: 'water',
                    value: toCanonicalMetricValue('water', Number(amount) || 0, waterUnit),
                    unit: 'ml',
                    observedAt: recordedAt,
                },
            }
        else if (kind === 'Weight')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Measurements',
                title: 'Weight',
                detail: `${amount || 0} ${weightUnit}`,
                source: 'You',
                observedAt: recordedAt,
                observation: {
                    metric: 'weight',
                    value: toCanonicalMetricValue('weight', Number(amount) || 0, weightUnit),
                    unit: 'kg',
                    observedAt: recordedAt,
                },
            }
        else if (kind === 'Check-in')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Check-ins',
                title: 'Energy check-in',
                detail: `${energy?.split(' ')[0] || 5} out of 10${note ? ` · ${note}` : ''}`,
                source: 'You',
                observedAt: recordedAt,
                observation: {
                    metric: 'energy',
                    value: Number(energy?.split(' ')[0]) || 5,
                    unit: 'score',
                    observedAt: recordedAt,
                },
            }
        else if (kind === 'Symptom')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Check-ins',
                title: symptom.trim() || 'Symptom',
                detail: [
                    `Severity ${Number(severity) || 5} out of 10`,
                    duration.trim() && `Duration ${duration.trim()}`,
                    note.trim(),
                    ...tags
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean)
                        .map(value => `#${value.replace(/^#/, '')}`),
                ]
                    .filter(Boolean)
                    .join(' Â· '),
                source: 'You',
                observedAt: recordedAt,
                observation: {
                    metric: `symptom_${
                        symptom
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '_') || 'other'
                    }`,
                    value: Number(severity) || 5,
                    unit: 'score',
                    observedAt: recordedAt,
                },
            }
        else
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Check-ins',
                title: 'Note',
                detail: [
                    note.trim() || 'Personal note',
                    ...tags
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean)
                        .map(value => `#${value.replace(/^#/, '')}`),
                ].join(' Â· '),
                source: 'You',
                observedAt: recordedAt,
            }
        finish(event)
    }
    return (
        <Modal
            opened={opened}
            onClose={close}
            centered
            radius="lg"
            closeButtonProps={{ 'aria-label': 'Close logger' }}
            title={
                <div>
                    <Text fw={700} size="lg">
                        {kind === 'Check-in' ? "How's your energy?" : `Log ${kind.toLowerCase()}`}
                    </Text>
                    <Text size="sm" c="dimmed">
                        Record this for {selectedDateLabel}
                    </Text>
                </div>
            }
        >
            <Stack gap="md">
                {duplicate && (
                    <Alert color="orange" title="This may already be logged">
                        An identical entry was added in the last two minutes.
                        <Group mt="sm" gap="xs">
                            <Button size="xs" variant="default" onClick={() => setDuplicate(null)}>
                                Review entry
                            </Button>
                            <Button
                                size="xs"
                                color="orange"
                                onClick={() => finish(duplicate, true)}
                            >
                                Log anyway
                            </Button>
                        </Group>
                    </Alert>
                )}
                {recentEvents.length > 0 && (
                    <div>
                        <Text size="sm" fw={650} mb={6}>
                            Recent actions
                        </Text>
                        <Group gap="xs">
                            {recentEvents.slice(0, 3).map(event => (
                                <Button
                                    key={event.id}
                                    size="compact-sm"
                                    variant="default"
                                    onClick={() =>
                                        finish({
                                            ...event,
                                            id: crypto.randomUUID(),
                                            time: new Date().toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            }),
                                            source: 'You',
                                            version: undefined,
                                            observedAt: selectedTimestamp(),
                                            observation: event.observation
                                                ? {
                                                      ...event.observation,
                                                      observedAt: selectedTimestamp(),
                                                  }
                                                : undefined,
                                        })
                                    }
                                >
                                    Repeat {event.title}
                                </Button>
                            ))}
                        </Group>
                    </div>
                )}
                {routines.length > 0 && (
                    <div>
                        <Text size="sm" fw={650} mb={6}>
                            Your routines
                        </Text>
                        <Group gap="xs">
                            {routines.map(routine => (
                                <Button
                                    key={routine.id}
                                    size="compact-sm"
                                    variant={activeRoutine === routine.name ? 'light' : 'default'}
                                    onClick={() => {
                                        const [first, ...remaining] = routine.kinds
                                        if (!first) return
                                        setActiveRoutine(routine.name)
                                        setKind(first)
                                        setRoutineQueue(remaining)
                                    }}
                                >
                                    {routine.name}
                                </Button>
                            ))}
                        </Group>
                        {activeRoutine && (
                            <Text size="xs" c="dimmed" mt={5}>
                                {activeRoutine} Â· {routineQueue.length + 1} records remaining
                            </Text>
                        )}
                    </div>
                )}
                {kind === 'Meal' && (
                    <>
                        <Select
                            label="Meal"
                            value={meal}
                            onChange={value => setMeal(value || 'Meal')}
                            data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                        />
                        <TextInput
                            label="What did you have?"
                            value={description}
                            onChange={e => setDescription(e.currentTarget.value)}
                            placeholder="Search foods or describe a meal"
                            leftSection={<IconSearch size={16} />}
                        />
                    </>
                )}
                {kind === 'Water' && (
                    <Stack gap="xs">
                        <Group grow>
                            <Button variant="default" onClick={() => setAmount(250)}>
                                +250 ml
                            </Button>
                            <Button variant="default" onClick={() => setAmount(500)}>
                                +500 ml
                            </Button>
                        </Group>
                        <NumberInput
                            autoFocus
                            label="Custom amount"
                            value={amount}
                            onChange={setAmount}
                            suffix={` ${waterUnit}`}
                            step={50}
                            min={1}
                        />
                    </Stack>
                )}
                {kind === 'Weight' && (
                    <>
                        <NumberInput
                            autoFocus
                            label="Weight"
                            value={amount}
                            onChange={setAmount}
                            decimalScale={1}
                            suffix={` ${weightUnit}`}
                            placeholder={weightUnit === 'lb' ? '165.0' : '72.4'}
                            min={1}
                        />
                        <TextInput
                            type="datetime-local"
                            label="Date and time"
                            value={recordedAt}
                            onChange={event => setRecordedAt(event.currentTarget.value)}
                        />
                    </>
                )}
                {kind === 'Check-in' && (
                    <>
                        <Select
                            autoFocus
                            label="How is your energy?"
                            value={energy}
                            onChange={setEnergy}
                            data={[
                                '1 · Very low',
                                '2',
                                '3',
                                '4',
                                '5 · Neutral',
                                '6',
                                '7',
                                '8',
                                '9',
                                '10 · Excellent',
                            ]}
                        />
                        <TextInput
                            label="Note (optional)"
                            value={note}
                            onChange={e => setNote(e.currentTarget.value)}
                            placeholder="Anything worth remembering?"
                        />
                    </>
                )}
                {kind === 'Symptom' && (
                    <>
                        <TextInput
                            label="Symptom"
                            value={symptom}
                            onChange={event => setSymptom(event.currentTarget.value)}
                            placeholder="For example, headache"
                            required
                        />
                        <NumberInput
                            label="Severity"
                            description="1 is mild; 10 is most intense."
                            value={severity}
                            onChange={setSeverity}
                            min={1}
                            max={10}
                        />
                        <TextInput
                            label="Duration (optional)"
                            value={duration}
                            onChange={event => setDuration(event.currentTarget.value)}
                            placeholder="For example, 45 minutes"
                        />
                        <TextInput
                            label="Context (optional)"
                            value={note}
                            onChange={event => setNote(event.currentTarget.value)}
                            placeholder="What was happening around it?"
                        />
                    </>
                )}
                {kind === 'Note' && (
                    <TextInput
                        autoFocus
                        label="What do you want to remember?"
                        value={note}
                        onChange={event => setNote(event.currentTarget.value)}
                    />
                )}
                {(kind === 'Symptom' || kind === 'Note') && (
                    <TextInput
                        label="Tags (optional)"
                        description="Separate tags with commas."
                        value={tags}
                        onChange={event => setTags(event.currentTarget.value)}
                        placeholder="travel, medication change"
                    />
                )}
                <Group justify="flex-end">
                    <Button variant="subtle" color="gray" onClick={close}>
                        Cancel
                    </Button>
                    <Button color="trackit" onClick={submit}>
                        {kind === 'Water'
                            ? `Log ${amount || 0} ${waterUnit}`
                            : kind === 'Weight'
                              ? 'Save weight'
                              : kind === 'Check-in'
                                ? 'Save check-in'
                                : kind === 'Symptom'
                                  ? 'Save symptom'
                                  : kind === 'Note'
                                    ? 'Save note'
                                    : 'Save meal'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
