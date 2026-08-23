import { useState } from 'react'
import { Alert, Button, Group, Modal, NumberInput, Select, Stack, TextInput } from '@mantine/core'
import type { Food, Nutrients } from '../domain/nutrition'

export function FoodEditModal({
    food,
    onClose,
    onSave,
}: {
    food: Food
    onClose: () => void
    onSave: (food: Omit<Food, 'id' | 'version'>) => Promise<void>
}) {
    const [name, setName] = useState(food.name)
    const [brand, setBrand] = useState(food.brand ?? '')
    const [servingName, setServingName] = useState(food.servingName)
    const [servingGrams, setServingGrams] = useState<number | string>(food.servingGrams)
    const [quality, setQuality] = useState(food.nutritionQuality ?? 'complete')
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>(food.per100g)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const save = async () => {
        setSaving(true)
        setError('')
        try {
            await onSave({
                name: name.trim(),
                brand: brand.trim() || undefined,
                servingName: servingName.trim(),
                servingGrams: Number(servingGrams),
                favorite: food.favorite,
                nutritionQuality: quality,
                per100g: nutrients,
            })
            onClose()
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not update food.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal opened onClose={onClose} title={`Edit ${food.name}`}>
            <Stack>
                <TextInput
                    label="Food name"
                    required
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                />
                <TextInput
                    label="Brand (optional)"
                    value={brand}
                    onChange={event => setBrand(event.currentTarget.value)}
                />
                <Group grow>
                    <TextInput
                        label="Serving name"
                        value={servingName}
                        onChange={event => setServingName(event.currentTarget.value)}
                    />
                    <NumberInput
                        label="Serving grams"
                        min={0.1}
                        value={servingGrams}
                        onChange={setServingGrams}
                    />
                </Group>
                <Select
                    label="Nutrition quality"
                    value={quality}
                    onChange={value =>
                        setQuality((value as 'complete' | 'estimated' | 'incomplete') ?? 'complete')
                    }
                    data={['complete', 'estimated', 'incomplete']}
                />
                <Group grow>
                    {(Object.keys(nutrients) as (keyof Nutrients)[]).map(key => (
                        <NumberInput
                            key={key}
                            label={key === 'calories' ? 'kcal / 100 g' : `${key} / 100 g`}
                            min={0}
                            value={nutrients[key]}
                            onChange={value =>
                                setNutrients(current => ({ ...current, [key]: Number(value) || 0 }))
                            }
                        />
                    ))}
                </Group>
                {error && <Alert color="orange">{error}</Alert>}
                <Button
                    loading={saving}
                    disabled={!name.trim() || !servingName.trim() || Number(servingGrams) <= 0}
                    onClick={() => void save()}
                >
                    Save food
                </Button>
            </Stack>
        </Modal>
    )
}
