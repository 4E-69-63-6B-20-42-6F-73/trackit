import { useState } from 'react'
import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import type { Food, Nutrients } from '../domain/nutrition'

const nutrientFields: Array<{ key: keyof Nutrients; label: string; unit: string }> = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbohydrates', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
    { key: 'fiber', label: 'Fiber', unit: 'g' },
    { key: 'sugar', label: 'Sugar', unit: 'g' },
    { key: 'saturatedFat', label: 'Saturated fat', unit: 'g' },
    { key: 'sodium', label: 'Sodium', unit: 'mg' },
    { key: 'potassium', label: 'Potassium', unit: 'mg' },
]

export function FoodEditModal({
    food,
    onClose,
    onSave,
    onDelete,
}: {
    food: Food
    onClose: () => void
    onSave: (food: Omit<Food, 'id' | 'version'>) => Promise<void>
    onDelete: () => Promise<void>
}) {
    const [name, setName] = useState(food.name)
    const [brand, setBrand] = useState(food.brand ?? '')
    const [servingName, setServingName] = useState(food.servingName)
    const [servingGrams, setServingGrams] = useState<number | string>(food.servingGrams)
    const [quality, setQuality] = useState(food.nutritionQuality ?? 'complete')
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>(food.per100g)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)

    const setNutrient = (key: keyof Nutrients, value: number | string) => {
        setNutrients(current => {
            const next = { ...current }
            if (value === '') delete next[key]
            else next[key] = Number(value)
            return next
        })
    }

    const save = async () => {
        setSaving(true)
        setError('')
        try {
            await onSave({
                name: name.trim(),
                brand: brand.trim() || undefined,
                barcode: food.barcode,
                catalogSource: food.catalogSource,
                catalogId: food.catalogId,
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

    const remove = async () => {
        setDeleting(true)
        setError('')
        try {
            await onDelete()
            onClose()
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Could not delete food.')
            setConfirmingDelete(false)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <Modal opened onClose={onClose} title={`Edit ${food.name}`} centered size="lg">
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
                <SimpleGrid cols={{ base: 1, xs: 2 }}>
                    <TextInput
                        label="Serving name"
                        value={servingName}
                        onChange={event => setServingName(event.currentTarget.value)}
                    />
                    <NumberInput
                        label="Serving grams"
                        min={0.1}
                        suffix=" g"
                        value={servingGrams}
                        onChange={setServingGrams}
                    />
                </SimpleGrid>
                <Select
                    label="Nutrition quality"
                    value={quality}
                    onChange={value =>
                        setQuality((value as 'complete' | 'estimated' | 'incomplete') ?? 'complete')
                    }
                    data={['complete', 'estimated', 'incomplete']}
                />
                <Text size="sm" c="dimmed">
                    Leave a nutrient blank when it is unknown. Unknown values are not treated as
                    zero.
                </Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                    {nutrientFields.map(({ key, label, unit }) => (
                        <NumberInput
                            key={key}
                            label={`${label} (${unit} / 100 g)`}
                            placeholder="Unknown"
                            min={0}
                            value={nutrients[key] ?? ''}
                            onChange={value => setNutrient(key, value)}
                        />
                    ))}
                </SimpleGrid>
                {error && <Alert color="orange">{error}</Alert>}
                {confirmingDelete && (
                    <Alert color="red" title="Delete this food?">
                        <Stack gap="sm">
                            <Text size="sm">
                                Logged meals keep their saved nutrition. If this food is used by a
                                recipe, remove it from that recipe first.
                            </Text>
                            <Group justify="flex-end" gap="xs">
                                <Button
                                    variant="default"
                                    size="xs"
                                    disabled={deleting}
                                    onClick={() => setConfirmingDelete(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="red"
                                    size="xs"
                                    loading={deleting}
                                    onClick={() => void remove()}
                                >
                                    Delete permanently
                                </Button>
                            </Group>
                        </Stack>
                    </Alert>
                )}
                <Group justify="space-between" align="center">
                    <Button
                        color="red"
                        variant="subtle"
                        disabled={saving || deleting}
                        onClick={() => setConfirmingDelete(true)}
                    >
                        Delete food
                    </Button>
                    <Button
                        loading={saving}
                        disabled={
                            deleting ||
                            !name.trim() ||
                            !servingName.trim() ||
                            Number(servingGrams) <= 0
                        }
                        onClick={() => void save()}
                    >
                        Save food
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
