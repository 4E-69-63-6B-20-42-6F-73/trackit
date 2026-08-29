import { useState } from 'react'
import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import {
    calendarLocalDateTimeToInstant,
    calendarLocalDateTimeValue,
    calendarTodayKey,
    formatCalendarDate,
} from '../../domain/calendar'
import { displayUnitFor, toCanonicalMetricValue } from '../../domain/metrics'
import { useServerData } from '../../hooks/useServerData'
import type { CreateObservationInput } from '../../lib/observationApi'

export type ManualEntryKind = 'Water' | 'Weight' | 'Check-in' | 'Symptom' | 'Note'

export function ManualEntryLogger({
    opened,
    close,
    add,
    initialKind,
    selectedDate,
}: {
    opened: boolean
    close: () => void
    add: (input: CreateObservationInput) => void
    initialKind: ManualEntryKind
    selectedDate?: string | null
}) {
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const locale = preferences?.locale
    const todayKey = calendarTodayKey(timezone)
    const targetDate = selectedDate ?? todayKey
    const initialNow = calendarLocalDateTimeValue(new Date(), timezone)
    const [initialDay, initialTime] = initialNow.split('T')
    const [kind] = useState<ManualEntryKind>(initialKind)
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
    const [recordedAt, setRecordedAt] = useState(
        `${targetDate}T${selectedDate && selectedDate !== initialDay ? '12:00' : initialTime}`,
    )
    const [error, setError] = useState('')
    const isHistorical = targetDate !== todayKey
    const selectedTimestamp = () =>
        calendarLocalDateTimeToInstant(recordedAt, timezone).toISOString()

    const submit = () => {
        setError('')
        if (!recordedAt) {
            setError('Choose a date and time for this observation.')
            return
        }
        const observedAt = selectedTimestamp()
        let input: CreateObservationInput
        if (kind === 'Water') {
            input = {
                id: crypto.randomUUID(),
                definitionId: 'water',
                valueType: 'number',
                category: 'Measurements',
                title: 'Water',
                source: 'You',
                observedAt,
                value: toCanonicalMetricValue('water', Number(amount) || 0, waterUnit),
                unit: 'ml',
                attributes: { description: `${amount || 0} ${waterUnit}` },
            }
        } else if (kind === 'Weight') {
            input = {
                id: crypto.randomUUID(),
                definitionId: 'weight',
                valueType: 'number',
                category: 'Measurements',
                title: 'Weight',
                source: 'You',
                observedAt,
                value: toCanonicalMetricValue('weight', Number(amount) || 0, weightUnit),
                unit: 'kg',
                attributes: { description: `${amount || 0} ${weightUnit}` },
            }
        } else if (kind === 'Check-in') {
            input = {
                id: crypto.randomUUID(),
                definitionId: 'energy',
                valueType: 'number',
                category: 'Check-ins',
                title: 'Energy check-in',
                source: 'You',
                observedAt,
                value: Number(energy?.split(' ')[0]) || 5,
                unit: 'score',
                attributes: {
                    description: `${energy?.split(' ')[0] || 5} out of 10${note ? ` · ${note}` : ''}`,
                },
            }
        } else if (kind === 'Symptom') {
            if (!symptom.trim()) {
                setError('Enter the symptom you want to record.')
                return
            }
            input = {
                id: crypto.randomUUID(),
                definitionId: 'symptom',
                valueType: 'number',
                category: 'Check-ins',
                title: symptom.trim(),
                source: 'You',
                observedAt,
                value: Number(severity) || 5,
                unit: 'score',
                attributes: {
                    description: [
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
                        .join(' · '),
                },
            }
        } else {
            input = {
                id: crypto.randomUUID(),
                definitionId: 'note',
                valueType: 'text',
                category: 'Check-ins',
                title: 'Note',
                textValue: [
                    note.trim() || 'Personal note',
                    ...tags
                        .split(',')
                        .map(value => value.trim())
                        .filter(Boolean)
                        .map(value => `#${value.replace(/^#/, '')}`),
                ].join(' · '),
                source: 'You',
                observedAt,
            }
        }
        add(input)
        close()
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
                    <Text size="sm" c={isHistorical ? 'orange' : 'dimmed'}>
                        {isHistorical
                            ? `Recording for ${formatCalendarDate(targetDate, locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}`
                            : 'Recording for today'}
                    </Text>
                </div>
            }
        >
            <Stack gap="md">
                {kind === 'Water' && (
                    <Stack gap="xs">
                        <Group grow>
                            <Button variant="default" onClick={() => setAmount(250)}>
                                250 ml
                            </Button>
                            <Button variant="default" onClick={() => setAmount(500)}>
                                500 ml
                            </Button>
                        </Group>
                        <NumberInput
                            autoFocus
                            label="Amount"
                            value={amount}
                            onChange={setAmount}
                            suffix={` ${waterUnit}`}
                            step={50}
                            min={1}
                        />
                    </Stack>
                )}
                {kind === 'Weight' && (
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
                            onChange={event => setNote(event.currentTarget.value)}
                            placeholder="Anything worth remembering?"
                        />
                    </>
                )}
                {kind === 'Symptom' && (
                    <>
                        <TextInput
                            autoFocus
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
                <TextInput
                    type="datetime-local"
                    label="Date and time"
                    description={`Interpreted in ${timezone}.`}
                    value={recordedAt}
                    onChange={event => setRecordedAt(event.currentTarget.value)}
                    required
                />
                {error && <Alert color="orange">{error}</Alert>}
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
                                  : 'Save note'}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
