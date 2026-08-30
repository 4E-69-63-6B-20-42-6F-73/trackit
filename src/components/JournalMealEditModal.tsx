import { useEffect, useState } from 'react'
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
import {
    calendarLocalDateTimeToInstant,
    calendarLocalDateTimeValue,
} from '../domain/calendar'
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

const servingLabel = (event: JournalEvent) => {
    if (event.detailView?.kind !== 'meal' || !event.detailView.serving) return 'Not recorded'
    const { amount, unit } = event.detailView.serving
    return unit === 'g' ? `${amount} g` : `${amount} ${amount === 1 ? 'serving' : 'servings'}`
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
    const [name, setName] = useState('')
    const [mealType, setMealType] = useState<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'>(
        'Snack',
    )
    const [recordedAt, setRecordedAt] = useState('')
    const [nutritionQuality, setNutritionQuality] = useState<
        'complete' | 'estimated' | 'incomplete'
    >('complete')
    const [nutrients, setNutrients] = useState<Record<NutrientKey, NumericValue>>({
        calories: '',
        protein: '',
        carbs: '',
        fat: '',
        fiber: '',
        sugar: '',
        saturatedFat: '',
        sodium: '',
        potassium: '',
    })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (event?.detailView?.kind !== 'meal') return
        setName(event.title)
        setMealType(event.detailView.mealType)
        setRecordedAt(calendarLocalDateTimeValue(new Date(event.observedAt), timezone))
        setNutritionQuality(event.detailView.nutritionQuality)
        setNutrients(
            Object.fromEntries(
                nutrientFields.map(([key]) => [key, event.detailView?.kind === 'meal' ? (event.detailView.nutrients[key] ?? '') : '']),
            ) as Record<NutrientKey, NumericValue>,
        )
        setError('')
    }, [event, timezone])

    const save = async () => {
        if (event?.detailView?.kind !== 'meal' || !name.trim() || !recordedAt) return
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
        setBusy(true)
        setError('')
        try {
            await updateMeal(event.id, event.version ?? 1, {
                name: name.trim(),
                mealType,
                eatenAt: calendarLocalDateTimeToInstant(recordedAt, timezone).toISOString(),
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
        <Modal opened={Boolean(event)} onClose={onClose} title="Edit meal" centered size="lg">
            {event?.detailView?.kind === 'meal' && (
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
                        onChange={value =>
                            setMealType(value as 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack')
                        }
                        data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }}>
                        <TextInput
                            type="datetime-local"
                            label="Date and time"
                            value={recordedAt}
                            onChange={change => setRecordedAt(change.currentTarget.value)}
                        />
                        <TextInput label="Logged amount" value={servingLabel(event)} readOnly />
                    </SimpleGrid>
                    <Select
                        label="Nutrition quality"
                        value={nutritionQuality}
                        onChange={value =>
                            value &&
                            setNutritionQuality(
                                value as 'complete' | 'estimated' | 'incomplete',
                            )
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
            )}
        </Modal>
    )
}
