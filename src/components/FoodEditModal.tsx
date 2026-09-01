import {
    Alert,
    Badge,
    Button,
    Group,
    Modal,
    MultiSelect,
    NumberInput,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { foodNutrientKeys, type Food, type Nutrients } from '../domain/nutrition'
import { listFoodCategories, setFoodCategories } from '../lib/foodCategoryApi'
import { serverQueryKeys } from '../lib/serverQueries'
import { FoodNutritionFields } from './FoodNutritionFields'

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
    const queryClient = useQueryClient()
    const [name, setName] = useState(food.name)
    const [brand, setBrand] = useState(food.brand ?? '')
    const [barcode, setBarcode] = useState(food.barcode ?? '')
    const [servingName, setServingName] = useState(food.servingName)
    const [servingGrams, setServingGrams] = useState<number | string>(food.servingGrams)
    const [nutrients, setNutrients] = useState<Partial<Nutrients>>(food.per100g)
    const [categoryIds, setCategoryIds] = useState<string[] | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState(false)
    const quality =
        food.nutritionQuality === 'estimated'
            ? 'estimated'
            : foodNutrientKeys.every(key => nutrients[key] !== undefined)
              ? 'complete'
              : 'incomplete'

    const categoriesQuery = useQuery({
        queryKey: serverQueryKeys.foodCategories,
        queryFn: ({ signal }) => listFoodCategories(signal),
    })
    const categories = categoriesQuery.data ?? []
    const selectedCategoryIds =
        categoryIds ??
        categories.filter(category => category.foodIds.includes(food.id)).map(category => category.id)

    const saveMutation = useMutation({
        mutationFn: async () => {
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
            if (categoriesQuery.isSuccess) await setFoodCategories(food.id, selectedCategoryIds)
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: serverQueryKeys.foodCategories })
            onClose()
        },
    })

    const deleteMutation = useMutation({
        mutationFn: onDelete,
        onSuccess: () => {
            setConfirmingDelete(false)
            onClose()
        },
    })

    const setNutrient = (key: keyof Nutrients, value: number | string) => {
        setNutrients(current => {
            const next = { ...current }
            if (value === '') delete next[key]
            else next[key] = Number(value)
            return next
        })
    }

    const saving = saveMutation.isPending
    const deleting = deleteMutation.isPending
    const saveError = saveMutation.isError
        ? saveMutation.error instanceof Error
            ? saveMutation.error.message
            : 'Could not update food.'
        : ''
    const deleteError = deleteMutation.isError
        ? deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : 'Could not delete food.'
        : ''

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
                    {categoriesQuery.isPending ? (
                        <Skeleton height={58} radius="md" role="status" aria-label="Loading food groups" />
                    ) : categoriesQuery.isSuccess ? (
                        <MultiSelect
                            label="Food groups"
                            description="Groups let flexible meal plans accept any matching food."
                            placeholder="Choose one or more groups"
                            data={categories.map(category => ({
                                value: category.id,
                                label: category.name,
                            }))}
                            value={selectedCategoryIds}
                            onChange={setCategoryIds}
                            searchable
                            clearable
                        />
                    ) : (
                        <Alert color="orange">Food groups could not be loaded.</Alert>
                    )}

                    <Text fw={650} mt="xs">Serving</Text>
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

                    {saveError && <Alert color="orange">{saveError}</Alert>}
                    <Group
                        justify="space-between"
                        style={{
                            position: 'sticky',
                            bottom: 0,
                            zIndex: 1,
                            background: 'var(--mantine-color-body)',
                            borderTop: '1px solid var(--mantine-color-default-border)',
                            paddingTop: 'var(--mantine-spacing-sm)',
                            paddingBottom: 'var(--mantine-spacing-xs)',
                        }}
                    >
                        <Button
                            color="red"
                            variant="subtle"
                            disabled={saving || deleting}
                            onClick={() => {
                                deleteMutation.reset()
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
                                onClick={() => saveMutation.mutate()}
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
                        <Button color="red" loading={deleting} onClick={() => deleteMutation.mutate()}>
                            Delete food
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    )
}
