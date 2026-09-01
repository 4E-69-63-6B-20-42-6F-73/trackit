import {
    Alert,
    Badge,
    Button,
    Group,
    Modal,
    MultiSelect,
    NumberInput,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useEffect, useState } from 'react'
import { foodNutrientKeys, type Food, type Nutrients } from '../domain/nutrition'
import { listFoodCategories, setFoodCategories, type FoodCategory } from '../lib/foodCategoryApi'
import { FoodNutritionFields } from './FoodNutritionFields'
import {
    FoodServingOptionsFields,
    servingOptionDrafts,
    servingOptionsFromDrafts,
    type ServingOptionDraft,
} from './FoodServingOptionsFields'
import { useToast } from './ToastProvider'

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
    const toast = useToast()
    const [name, setName] = useState(food.name)
    const [brand, setBrand] = useState(food.brand ?? '')
    const [barcode, setBarcode] = useState(food.barcode ?? '')
    const [servingName, setServingName] = useState(food.servingName)
    const [servingGrams, setServingGrams] = useState<number | string>(food.servingGrams)
    const [servingOptions, setServingOptions] = useState<ServingOptionDraft[]>(
        servingOptionDrafts(food.servingOptions),
    )
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>(food.per100g)
    const [categories, setCategories] = useState<FoodCategory[]>([])
    const [categoryIds, setCategoryIds] = useState<string[]>([])
    const [categoriesLoaded, setCategoriesLoaded] = useState(false)
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

    useEffect(() => {
        void listFoodCategories()
            .then(nextCategories => {
                setCategories(nextCategories)
                setCategoryIds(
                    nextCategories
                        .filter(category => category.foodIds.includes(food.id))
                        .map(category => category.id),
                )
                setCategoriesLoaded(true)
            })
            .catch(() => undefined)
    }, [food.id])

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
                servingOptions: servingOptionsFromDrafts(servingOptions),
                favorite: food.favorite,
                nutritionQuality: quality,
                per100g: nutrients,
            })
            if (categoriesLoaded) await setFoodCategories(food.id, categoryIds)
            toast.success(`${name.trim()} updated.`)
            onClose()
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : 'Could not update food.'
            setError(message)
            toast.error(message)
        } finally {
            setSaving(false)
        }
    }

    const remove = async () => {
        setDeleting(true)
        setDeleteError('')
        try {
            await onDelete()
            toast.success(`${food.name} deleted.`)
            setConfirmingDelete(false)
            onClose()
        } catch (reason) {
            const message = reason instanceof Error ? reason.message : 'Could not delete food.'
            setDeleteError(message)
            toast.error(message)
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
                className="food-editor-modal"
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
                    {categoriesLoaded && (
                        <MultiSelect
                            label="Food groups"
                            description="Groups let flexible meal plans accept any matching food."
                            placeholder="Choose one or more groups"
                            data={categories.map(category => ({
                                value: category.id,
                                label: category.name,
                            }))}
                            value={categoryIds}
                            onChange={setCategoryIds}
                            searchable
                            clearable
                        />
                    )}

                    <div>
                        <Text fw={650} mt="xs">
                            Serving
                        </Text>
                        <Text size="sm" c="dimmed">
                            Serving size is a logging shortcut. Nutrition values below always describe
                            100 g.
                        </Text>
                    </div>
                    <SimpleGrid cols={{ base: 1, xs: 2 }}>
                        <TextInput
                            label="Default serving label"
                            placeholder="e.g. cup, scoop, container"
                            value={servingName}
                            onChange={event => setServingName(event.currentTarget.value)}
                        />
                        <NumberInput
                            label="Default serving weight"
                            suffix=" g"
                            hideControls
                            min={0.1}
                            value={servingGrams}
                            onChange={setServingGrams}
                        />
                    </SimpleGrid>

                    <FoodServingOptionsFields options={servingOptions} onChange={setServingOptions} />

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
                    <Group justify="space-between" className="food-editor-actions">
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
                            <Button
                                variant="default"
                                disabled={saving || deleting}
                                onClick={onClose}
                            >
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
