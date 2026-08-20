import { useState } from 'react'
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core'
import type { MealRecord } from '../lib/nutritionApi'

type EditableMeal = {
    name: string
    mealType: MealRecord['mealType']
    eatenAt: string
    nutrients: Record<string, number>
}

const localDateTime = (iso: string) => {
    const date = new Date(iso)
    const offset = date.getTimezoneOffset() * 60_000
    return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function MealEditModal({
    meal,
    onClose,
    onSave,
}: {
    meal: MealRecord
    onClose: () => void
    onSave: (input: EditableMeal) => Promise<void>
}) {
    const [name, setName] = useState(meal.name)
    const [mealType, setMealType] = useState<MealRecord['mealType']>(meal.mealType)
    const [eatenAt, setEatenAt] = useState(localDateTime(meal.eatenAt))
    const [nutrients, setNutrients] = useState<Record<string, number>>({
        calories: meal.nutrientSnapshot.calories ?? 0,
        protein: meal.nutrientSnapshot.protein ?? 0,
        carbs: meal.nutrientSnapshot.carbs ?? 0,
        fat: meal.nutrientSnapshot.fat ?? 0,
        fiber: meal.nutrientSnapshot.fiber ?? 0,
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const save = async () => {
        if (!name.trim() || !eatenAt) return
        setSaving(true)
        setError('')
        try {
            await onSave({
                name: name.trim(),
                mealType,
                eatenAt: new Date(eatenAt).toISOString(),
                nutrients,
            })
            onClose()
        } catch {
            setError('The meal could not be updated. Reload and try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal opened onClose={onClose} title="Edit meal">
            <Stack>
                <TextInput
                    label="Meal name"
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                />
                <Select
                    label="Meal type"
                    value={mealType}
                    onChange={value => setMealType((value as MealRecord['mealType']) ?? 'Lunch')}
                    data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                />
                <TextInput
                    label="Eaten at"
                    type="datetime-local"
                    value={eatenAt}
                    onChange={event => setEatenAt(event.currentTarget.value)}
                />
                <Group grow>
                    {(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const).map(key => (
                        <NumberInput
                            key={key}
                            label={key === 'calories' ? 'kcal' : `${key} (g)`}
                            min={0}
                            value={nutrients[key] ?? 0}
                            onChange={value =>
                                setNutrients(current => ({ ...current, [key]: Number(value) || 0 }))
                            }
                        />
                    ))}
                </Group>
                {error && <Alert color="orange">{error}</Alert>}
                <Button loading={saving} onClick={() => void save()}>
                    Save meal
                </Button>
            </Stack>
        </Modal>
    )
}
