import { useState } from 'react'
import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    Select,
    SimpleGrid,
    Slider,
    Stack,
    TagsInput,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core'
import {
    calendarLocalDateTimeToInstant,
    calendarLocalDateTimeValue,
    calendarTodayKey,
    formatCalendarDate,
} from '@trackit/domain/calendar'
import { convertMetricValue, displayUnitFor, toCanonicalMetricValue } from '@trackit/domain/metrics'
import { useServerData } from '../../hooks/useServerData'
import type { CreateObservationInput } from '../../lib/observationApi'

export type ManualEntryKind = 'Water' | 'Weight' | 'Check-in' | 'Symptom' | 'Note'

type WaterChoice = '100' | '250' | 'custom'
type DurationUnit = 'minutes' | 'hours'

const energyLabels = [
    '',
    'Very low',
    'Low',
    'Low',
    'Slightly low',
    'Neutral',
    'Slightly high',
    'High',
    'High',
    'Very high',
    'Very high',
] as const
const energyLabel = (value: number) => energyLabels[Math.round(value)] ?? 'Neutral'
const severityLabel = (value: number) => (value <= 3 ? 'Mild' : value <= 7 ? 'Moderate' : 'Severe')

export function ManualEntryLogger({
    opened,
    close,
    add,
    pending,
    serverError,
    initialKind,
    selectedDate,
}: {
    opened: boolean
    close: () => void
    add: (input: CreateObservationInput) => Promise<boolean>
    pending: boolean
    serverError: string
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
    const weightUnit = displayUnitFor('weight', preferences?.metricPreferences)
    const waterUnit = displayUnitFor('water', preferences?.metricPreferences)
    const [weightAmount, setWeightAmount] = useState<number | string>(
        weightUnit === 'lb' ? 165 : 75,
    )
    const [waterChoice, setWaterChoice] = useState<WaterChoice>('250')
    const [customWaterAmount, setCustomWaterAmount] = useState<number | string>('')
    const [energy, setEnergy] = useState(5)
    const [note, setNote] = useState('')
    const [symptom, setSymptom] = useState('')
    const [severity, setSeverity] = useState(5)
    const [durationAmount, setDurationAmount] = useState<number | string>('')
    const [durationUnit, setDurationUnit] = useState<DurationUnit>('minutes')
    const [tags, setTags] = useState<string[]>([])
    const [recordedAt, setRecordedAt] = useState(
        `${targetDate}T${selectedDate && selectedDate !== initialDay ? '12:00' : initialTime}`,
    )
    const [validationError, setValidationError] = useState('')
    const isHistorical = targetDate !== todayKey
    const selectedTimestamp = () =>
        calendarLocalDateTimeToInstant(recordedAt, timezone).toISOString()
    const waterPreset = (millilitres: 100 | 250) => {
        const value = convertMetricValue('water', millilitres, 'ml', waterUnit)
        const maximumFractionDigits = waterUnit === 'L' ? 2 : waterUnit === 'fl oz' ? 1 : 0
        const amount = value.toLocaleString(locale, { maximumFractionDigits })
        return { amount, label: `${amount} ${waterUnit}` }
    }
    const water100 = waterPreset(100)
    const water250 = waterPreset(250)
    const selectedWaterPreset = waterChoice === '100' ? water100 : water250
    const customWaterStep = waterUnit === 'L' ? 0.05 : waterUnit === 'fl oz' ? 1 : 50
    const customWaterMin = waterUnit === 'L' ? 0.01 : waterUnit === 'fl oz' ? 0.1 : 1
    const customWaterPrecision = waterUnit === 'L' ? 2 : waterUnit === 'fl oz' ? 1 : 0
    const durationValue = Math.max(0, Math.floor(Number(durationAmount) || 0))
    const duration = durationValue
        ? durationUnit === 'hours'
            ? `${durationValue} ${durationValue === 1 ? 'hour' : 'hours'}`
            : `${durationValue} min`
        : ''
    const formattedTags = tags
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => `#${value.replace(/^#/, '')}`)

    const submit = async () => {
        setValidationError('')
        if (!recordedAt) {
            setValidationError('Choose a date and time for this observation.')
            return
        }
        if (kind === 'Water' && waterChoice === 'custom' && Number(customWaterAmount) <= 0) {
            setValidationError('Enter the amount of water you want to record.')
            return
        }
        const observedAt = selectedTimestamp()
        let input: CreateObservationInput
        if (kind === 'Water') {
            const custom = waterChoice === 'custom'
            const enteredAmount = custom ? Number(customWaterAmount) || 0 : Number(waterChoice)
            input = {
                id: crypto.randomUUID(),
                definitionId: 'water',
                valueType: 'number',
                category: 'Measurements',
                title: 'Water',
                source: 'You',
                observedAt,
                value: custom
                    ? toCanonicalMetricValue('water', enteredAmount, waterUnit)
                    : enteredAmount,
                unit: 'ml',
                attributes: {
                    description: custom
                        ? `${enteredAmount} ${waterUnit}`
                        : selectedWaterPreset.label,
                },
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
                value: toCanonicalMetricValue('weight', Number(weightAmount) || 0, weightUnit),
                unit: 'kg',
                attributes: { description: `${weightAmount || 0} ${weightUnit}` },
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
                value: energy,
                unit: 'score',
                attributes: {
                    description: `${energy} out of 10${note ? ` · ${note}` : ''}`,
                },
            }
        } else if (kind === 'Symptom') {
            if (!symptom.trim()) {
                setValidationError('Enter the symptom you want to record.')
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
                value: severity,
                unit: 'score',
                attributes: {
                    description: [
                        `Severity ${severity} out of 10`,
                        duration && `Duration ${duration}`,
                        note.trim(),
                        ...formattedTags,
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
                textValue: [note.trim() || 'Personal note', ...formattedTags].join(' · '),
                source: 'You',
                observedAt,
            }
        }
        if (await add(input)) close()
    }

    const error = validationError || serverError

    return (
        <Modal
            opened={opened}
            onClose={() => !pending && close()}
            centered
            radius="lg"
            closeButtonProps={{ 'aria-label': 'Close logger', disabled: pending }}
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
                    <Stack gap="sm">
                        <SimpleGrid cols={3} spacing="sm">
                            <Button
                                variant={waterChoice === '100' ? 'light' : 'default'}
                                color="trackit"
                                aria-label={water100.label}
                                aria-pressed={waterChoice === '100'}
                                onClick={() => setWaterChoice('100')}
                                style={{ aspectRatio: '1 / 1', height: 'auto' }}
                                styles={{ label: { flexDirection: 'column', gap: 2 } }}
                            >
                                <Text size="lg" fw={700} lh={1}>
                                    {water100.amount}
                                </Text>
                                <Text size="xs" fw={600}>
                                    {waterUnit}
                                </Text>
                            </Button>
                            <Button
                                variant={waterChoice === '250' ? 'light' : 'default'}
                                color="trackit"
                                aria-label={water250.label}
                                aria-pressed={waterChoice === '250'}
                                onClick={() => setWaterChoice('250')}
                                style={{ aspectRatio: '1 / 1', height: 'auto' }}
                                styles={{ label: { flexDirection: 'column', gap: 2 } }}
                            >
                                <Text size="lg" fw={700} lh={1}>
                                    {water250.amount}
                                </Text>
                                <Text size="xs" fw={600}>
                                    {waterUnit}
                                </Text>
                            </Button>
                            <Button
                                variant={waterChoice === 'custom' ? 'light' : 'default'}
                                color="trackit"
                                aria-pressed={waterChoice === 'custom'}
                                onClick={() => setWaterChoice('custom')}
                                style={{ aspectRatio: '1 / 1', height: 'auto' }}
                            >
                                Custom
                            </Button>
                        </SimpleGrid>
                        {waterChoice === 'custom' && (
                            <NumberInput
                                autoFocus
                                label="Custom amount"
                                value={customWaterAmount}
                                onChange={setCustomWaterAmount}
                                suffix={` ${waterUnit}`}
                                step={customWaterStep}
                                min={customWaterMin}
                                decimalScale={customWaterPrecision}
                            />
                        )}
                    </Stack>
                )}
                {kind === 'Weight' && (
                    <NumberInput
                        autoFocus
                        label="Weight"
                        value={weightAmount}
                        onChange={setWeightAmount}
                        decimalScale={1}
                        suffix={` ${weightUnit}`}
                        placeholder={weightUnit === 'lb' ? '165.0' : '72.4'}
                        min={1}
                    />
                )}
                {kind === 'Check-in' && (
                    <>
                        <Stack gap={6} pb="xs">
                            <Group justify="space-between" align="baseline">
                                <Text size="sm" fw={600}>
                                    How is your energy?
                                </Text>
                                <Text size="sm" fw={700}>
                                    {energy} · {energyLabel(energy)}
                                </Text>
                            </Group>
                            <Slider
                                color="trackit"
                                value={energy}
                                onChange={setEnergy}
                                min={1}
                                max={10}
                                step={1}
                                thumbLabel="Energy level"
                                label={value => `${value} · ${energyLabel(value)}`}
                                marks={[
                                    { value: 1, label: 'Low' },
                                    { value: 5, label: 'Neutral' },
                                    { value: 10, label: 'High' },
                                ]}
                                styles={{
                                    track: {
                                        backgroundImage:
                                            'linear-gradient(90deg, var(--mantine-color-orange-5) 0%, var(--mantine-color-gray-4) 44%, var(--mantine-color-teal-6) 100%)',
                                    },
                                    bar: { backgroundColor: 'transparent' },
                                }}
                            />
                        </Stack>
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
                        <Stack gap={6} pb="xs">
                            <Group justify="space-between" align="baseline">
                                <Text size="sm" fw={600}>
                                    Severity
                                </Text>
                                <Text size="sm" fw={700}>
                                    {severity} · {severityLabel(severity)}
                                </Text>
                            </Group>
                            <Slider
                                color="orange"
                                value={severity}
                                onChange={setSeverity}
                                min={1}
                                max={10}
                                step={1}
                                thumbLabel="Symptom severity"
                                label={value => `${value} · ${severityLabel(value)}`}
                                marks={[
                                    { value: 1, label: 'Mild' },
                                    { value: 5, label: 'Moderate' },
                                    { value: 10, label: 'Severe' },
                                ]}
                                styles={{
                                    track: {
                                        backgroundImage:
                                            'linear-gradient(90deg, var(--mantine-color-teal-4) 0%, var(--mantine-color-yellow-5) 50%, var(--mantine-color-red-6) 100%)',
                                    },
                                    bar: { backgroundColor: 'transparent' },
                                }}
                            />
                        </Stack>
                        <Stack gap={6}>
                            <Text size="sm" fw={600}>
                                Duration (optional)
                            </Text>
                            <SimpleGrid cols={2} spacing="sm">
                                <NumberInput
                                    label="Amount"
                                    value={durationAmount}
                                    onChange={setDurationAmount}
                                    min={0}
                                    step={durationUnit === 'hours' ? 1 : 5}
                                    decimalScale={0}
                                />
                                <Select
                                    label="Unit"
                                    value={durationUnit}
                                    onChange={value =>
                                        setDurationUnit((value ?? 'minutes') as DurationUnit)
                                    }
                                    data={[
                                        { value: 'minutes', label: 'Minutes' },
                                        { value: 'hours', label: 'Hours' },
                                    ]}
                                    allowDeselect={false}
                                />
                            </SimpleGrid>
                        </Stack>
                        <Textarea
                            label="Context (optional)"
                            value={note}
                            onChange={event => setNote(event.currentTarget.value)}
                            placeholder="What was happening around it?"
                            rows={3}
                        />
                    </>
                )}
                {kind === 'Note' && (
                    <Textarea
                        autoFocus
                        label="What do you want to remember?"
                        value={note}
                        onChange={event => setNote(event.currentTarget.value)}
                        placeholder="Write anything worth remembering"
                        rows={4}
                    />
                )}
                {(kind === 'Symptom' || kind === 'Note') && (
                    <TagsInput
                        label="Tags (optional)"
                        description="Type a tag and press comma or Enter."
                        value={tags}
                        onChange={setTags}
                        splitChars={[',']}
                        placeholder="travel, medication change"
                        clearable
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
                    <Button variant="subtle" color="gray" disabled={pending} onClick={close}>
                        Cancel
                    </Button>
                    <Button
                        color="trackit"
                        onClick={() => void submit()}
                        loading={pending}
                        disabled={
                            pending ||
                            (kind === 'Water' &&
                                waterChoice === 'custom' &&
                                Number(customWaterAmount) <= 0)
                        }
                    >
                        {kind === 'Water'
                            ? waterChoice === 'custom'
                                ? `Log ${customWaterAmount || 0} ${waterUnit}`
                                : `Log ${selectedWaterPreset.label}`
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
