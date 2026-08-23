import { useEffect, useState } from 'react'
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
import { getPreferences, type ExperiencePreferences } from '../lib/preferencesApi'

export type QuickAddKind = 'Meal' | 'Water' | 'Weight' | 'Check-in' | 'Symptom' | 'Note'

export function QuickAdd({
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
    initialKind?: QuickAddKind
    recentEvents?: JournalEvent[]
    selectedDate?: string | null
}) {
    const [kind, setKind] = useState<QuickAddKind>(initialKind ?? 'Meal')
    const hour = new Date().getHours()
    const [meal, setMeal] = useState(
        hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 21 ? 'Dinner' : 'Snack',
    )
    const [description, setDescription] = useState('')
    const [amount, setAmount] = useState<number | string>(250)
    const [energy, setEnergy] = useState<string | null>('5 · Neutral')
    const [note, setNote] = useState('')
    const [symptom, setSymptom] = useState('')
    const [severity, setSeverity] = useState<number | string>(5)
    const [duration, setDuration] = useState('')
    const [tags, setTags] = useState('')
    const [duplicate, setDuplicate] = useState<JournalEvent | null>(null)
    const [routines, setRoutines] = useState<NonNullable<ExperiencePreferences['routines']>>([])
    const [routineQueue, setRoutineQueue] = useState<QuickAddKind[]>([])
    const [activeRoutine, setActiveRoutine] = useState('')

    useEffect(() => {
        void getPreferences()
            .then(preferences => setRoutines(preferences.experience?.routines ?? []))
            .catch(() => undefined)
    }, [])
    const selectedTimestamp = () => {
        const now = new Date()
        if (!selectedDate) return now.toISOString()
        const [year, month, day] = selectedDate.split('-').map(Number)
        return new Date(
            year,
            month - 1,
            day,
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
        ).toISOString()
    }
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
                detail: `${amount || 0} ml`,
                source: 'You',
                observedAt: recordedAt,
                observation: {
                    metric: 'water',
                    value: Number(amount) || 0,
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
                detail: `${amount || 0} kg`,
                source: 'You',
                observedAt: recordedAt,
                observation: {
                    metric: 'weight',
                    value: Number(amount) || 0,
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
            closeButtonProps={{ 'aria-label': 'Close quick add' }}
            title={
                <div>
                    <Text fw={700} size="lg">
                        Quick add
                    </Text>
                    <Text size="sm" c="dimmed">
                        Add something to {selectedDateLabel}
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
                <Select
                    label="What do you want to record?"
                    value={kind}
                    onChange={value => value && setKind(value as QuickAddKind)}
                    data={[
                        { group: 'Eat or drink', items: ['Meal', 'Water'] },
                        { group: 'Measure', items: ['Weight'] },
                        { group: 'How I feel', items: ['Check-in', 'Symptom'] },
                        { group: 'Remember', items: ['Note'] },
                    ]}
                    allowDeselect={false}
                />
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
                    <NumberInput
                        label="Amount"
                        value={amount}
                        onChange={setAmount}
                        suffix=" ml"
                        step={50}
                        min={0}
                    />
                )}
                {kind === 'Weight' && (
                    <NumberInput
                        label="Weight"
                        value={amount}
                        onChange={setAmount}
                        decimalScale={1}
                        suffix=" kg"
                        placeholder="72.4"
                        min={0}
                    />
                )}
                {kind === 'Check-in' && (
                    <>
                        <Select
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
                            ? `Log ${amount || 0} ml`
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
