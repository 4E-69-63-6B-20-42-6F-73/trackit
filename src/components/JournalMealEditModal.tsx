import { useState } from 'react'
import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { calendarLocalDateTimeToInstant, calendarLocalDateTimeValue } from '../domain/calendar'
import type { JournalEvent } from '../domain/types'
import { useServerData } from '../hooks/useServerData'
import { updateMeal } from '../lib/nutritionApi'

const nutrientFields = [
    ['calories', 'Energy', 'kcal'],
    ['protein', 'Protein', 'g'],
    ['carbs', 'Carbs', 'g'],
    ['fat', 'Fat', 'g'],
    ['fiber', 'Fiber', 'g'],
    ['sugar', 'Sugar', 'g'],
    ['saturatedFat', 'Saturated fat', 'g'],
    ['sodium', 'Sodium', 'mg'],
    ['potassium', 'Potassium', 'mg'],
] as const

type NutrientKey = (typeof nutrientFields)[number][0]
type NumericValue = string | number
type MealEvent = JournalEvent & {
    detailView: Extract<NonNullable<JournalEvent['detailView']>, { kind: 'meal' }>
}

function MealEditForm({
    event,
    timezone,
    onClose,
    onSaved,
}: {
    event: MealEvent
    timezone: string
    onClose: () => void
    onSaved: () => void
}) {
    const [name, setName] = useState(event.title)
    const [mealType, setMealType] = useState(event.detailView.mealType)
    const [recordedAt, setRecordedAt] = useState(
        calendarLocalDateTimeValue(new Date(event.observedAt), timezone),
    )
    const [servingAmount, setServingAmount] = useState<NumericValue>(
        event.detailView.serving?.amount ?? '',
    )
    const [servingUnit, setServingUnit] = useState<'g' | 'serving'>(
        event.detailView.serving?.unit ?? 'g',
    )
    const [nutritionQuality, setNutritionQuality] = useState(event.detailView.nutritionQuality)
    const [nutrients, setNutrients] = useState<Record<NutrientKey, NumericValue>>(
        () =>
            Object.fromEntries(
                nutrientFields.map(([key]) => [key, event.detailView.nutrients[key] ?? '']),
            ) as Record<NutrientKey, NumericValue>,
    )
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const save = async () => {
        if (!name.trim() || !recordedAt) return
        const nextNutrients = { ...event.detailView.nutrients }
        for (const [key] of nutrientFields) {
            const raw = nutrients[key]
            if (raw === '') {
                delete nextNutrients[key]
                continue
            }
            const value = Number(raw)
            if (!Number.isFinite(value) || value < 0) {
                setError('Nutrition values must be zero or greater.')
                return
            }
            nextNutrients[key] = value
        }
        const amount = servingAmount === '' ? null : Number(servingAmount)
        if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
            setError('Amount must be greater than zero.')
            return
        }
        setBusy(true)
        setError('')
        try {
            await updateMeal(event.id, event.version ?? 1, {
                name: name.trim(),
                mealType,
                eatenAt: calendarLocalDateTimeToInstant(recordedAt, timezone).toISOString(),
                serving: amount === null ? null : { amount, unit: servingUnit },
                nutrients: nextNutrients,
                nutritionQuality,
            })
            window.dispatchEvent(new Event('trackit:nutrition-changed'))
            window.dispatchEvent(new Event('trackit:observations-changed'))
            onSaved()
        } catch {
            setError('This meal could not be updated. Reload and try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Stack gap="md">
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
                label="Name"
                value={name}
                maxLength={160}
                onChange={change => setName(change.currentTarget.value)}
            />
            <SegmentedControl
                fullWidth
                value={mealType}
                onChange={value => setMealType(value as 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack')}
                data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
            />
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <TextInput
                    type="datetime-local"
                    label="Date and time"
                    value={recordedAt}
                    onChange={change => setRecordedAt(change.currentTarget.value)}
                />
                <NumberInput
                    label="Amount"
                    value={servingAmount}
                    min={0}
                    decimalScale={2}
                    placeholder="Not recorded"
                    onChange={setServingAmount}
                />
                <Select
                    label="Amount unit"
                    value={servingUnit}
                    onChange={value => value && setServingUnit(value as 'g' | 'serving')}
                    data={[
                        { value: 'g', label: 'Grams' },
                        { value: 'serving', label: 'Servings' },
                    ]}
                />
            </SimpleGrid>
            <Select
                label="Nutrition quality"
                value={nutritionQuality}
                onChange={value =>
                    value && setNutritionQuality(value as 'complete' | 'estimated' | 'incomplete')
                }
                data={[
                    { value: 'complete', label: 'Complete' },
                    { value: 'estimated', label: 'Estimated' },
                    { value: 'incomplete', label: 'Incomplete' },
                ]}
            />
            <div>
                <Text fw={650} mb="sm">
                    Nutrition for this entry
                </Text>
                <SimpleGrid cols={{ base: 2, sm: 3 }}>
                    {nutrientFields.map(([key, label, unit]) => (
                        <NumberInput
                            key={key}
                            label={label}
                            value={nutrients[key]}
                            min={0}
                            decimalScale={2}
                            suffix={` ${unit}`}
                            placeholder="Not recorded"
                            onChange={value =>
                                setNutrients(current => ({ ...current, [key]: value }))
                            }
                        />
                    ))}
                </SimpleGrid>
            </div>
            <Group justify="flex-end">
                <Button variant="default" onClick={onClose} disabled={busy}>
                    Cancel
                </Button>
                <Button loading={busy} disabled={!name.trim() || !recordedAt} onClick={save}>
                    Save changes
                </Button>
            </Group>
        </Stack>
    )
}

export function JournalMealEditModal({
    event,
    onClose,
    onSaved,
}: {
    event: JournalEvent | null
    onClose: () => void
    onSaved: () => void
}) {
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const mealEvent = event?.detailView?.kind === 'meal' ? (event as MealEvent) : null

    return (
        <Modal opened={Boolean(mealEvent)} onClose={onClose} title="Edit meal" centered size="lg">
            {mealEvent && (
                <MealEditForm
                    key={`${mealEvent.id}:${mealEvent.version ?? 0}:${timezone}`}
                    event={mealEvent}
                    timezone={timezone}
                    onClose={onClose}
                    onSaved={onSaved}
                />
            )}
        </Modal>
    )
}
