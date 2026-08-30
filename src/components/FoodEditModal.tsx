import {
    Alert,
    Badge,
    Button,
    Group,
    Modal,
    NumberInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useState } from 'react'
import type { Food, Nutrients } from '../domain/nutrition'
import { FoodNutritionFields, foodNutrientKeys } from './FoodNutritionFields'

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
    const compact = useMediaQuery('(max-width: 36em)')
    const [name, setName] = useState(food.name)
    const [brand, setBrand] = useState(food.brand ?? '')
    const [barcode, setBarcode] = useState(food.barcode ?? '')
    const [servingName, setServingName] = useState(food.servingName)
    const [servingGrams, setServingGrams] = useState<number | string>(food.servingGrams)
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>(food.per100g)
    const [error, setError] = useState('')
    const [deleteError, setDeleteError] = useState('')
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const quality =
        food.nutritionQuality === 'estimated'
            ? 'estimated'
            : foodNutrientKeys.every(key => nutrients[key] !== undefined)
              ? 'complete'
              : 'incomplete'

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
                barcode: barcode.trim() || undefined,
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
        setDeleteError('')
        try {
            await onDelete()
            setConfirmingDelete(false)
            onClose()
        } catch (reason) {
            setDeleteError(reason instanceof Error ? reason.message : 'Could not delete food.')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <>
            <Modal
                opened
                onClose={onClose}
                title="Edit food"
                centered={!compact}
                fullScreen={compact}
                size="lg"
            >
                <Stack>
                    <Text fw={650}>Basics</Text>
                    <TextInput
                        label="Name"
                        required
                        value={name}
                        onChange={event => setName(event.currentTarget.value)}
                    />
                    <TextInput
                        label="Brand (optional)"
                        value={brand}
                        onChange={event => setBrand(event.currentTarget.value)}
                    />
                    <TextInput
                        label="Barcode (optional)"
                        value={barcode}
                        onChange={event => setBarcode(event.currentTarget.value)}
                    />
                    {food.catalogSource && (
                        <Text size="xs" c="dimmed">
                            Source: {food.catalogSource}
                        </Text>
                    )}

                    <Text fw={650} mt="xs">
                        Serving
                    </Text>
                    <SimpleGrid cols={{ base: 1, xs: 2 }}>
                        <TextInput
                            label="Serving label"
                            placeholder="e.g. cup, scoop, container"
                            value={servingName}
                            onChange={event => setServingName(event.currentTarget.value)}
                        />
                        <NumberInput
                            label="Serving weight"
                            suffix=" g"
                            hideControls
                            min={0.1}
                            value={servingGrams}
                            onChange={setServingGrams}
                        />
                    </SimpleGrid>

                    <FoodNutritionFields
                        nutrients={nutrients}
                        onChange={setNutrient}
                        status={
                            quality === 'complete' ? undefined : (
                                <Badge size="sm" variant="light">
                                    {quality === 'estimated'
                                        ? 'Estimated nutrition'
                                        : 'Incomplete nutrition'}
                                </Badge>
                            )
                        }
                    />

                    {error && <Alert color="orange">{error}</Alert>}
                    <Group justify="space-between" className="food-modal-actions">
                        <Button
                            color="red"
                            variant="subtle"
                            disabled={saving || deleting}
                            onClick={() => {
                                setDeleteError('')
                                setConfirmingDelete(true)
                            }}
                        >
                            Delete food
                        </Button>
                        <Group gap="xs">
                            <Button variant="default" disabled={saving || deleting} onClick={onClose}>
                                Cancel
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
                                Save changes
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </Modal>

            <Modal
                opened={confirmingDelete}
                onClose={() => setConfirmingDelete(false)}
                title="Delete this food?"
                centered
                size="sm"
            >
                <Stack>
                    <Text size="sm">
                        This permanently removes {food.name} from your food library. Logged meals
                        keep their saved nutrition. If this food is used by a recipe, remove it from
                        that recipe first.
                    </Text>
                    {deleteError && <Alert color="orange">{deleteError}</Alert>}
                    <Group justify="flex-end">
                        <Button
                            variant="default"
                            disabled={deleting}
                            onClick={() => setConfirmingDelete(false)}
                        >
                            Keep food
                        </Button>
                        <Button color="red" loading={deleting} onClick={() => void remove()}>
                            Delete food
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    )
}
