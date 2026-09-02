import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { nutrientsPerServing, type Food } from '@trackit/domain/nutrition'
import { createRecipe } from '../lib/nutritionApi'
import { serverQueryKeys } from '../lib/serverQueries'

type Ingredient = { id: string; foodId: string | null; grams: number | string }
const newIngredient = (): Ingredient => ({ id: crypto.randomUUID(), foodId: null, grams: 100 })

export function NewRecipeModal({
    opened,
    onClose,
    foods,
    onCreated,
}: {
    opened: boolean
    onClose: () => void
    foods: Food[]
    onCreated: () => void
}) {
    const queryClient = useQueryClient()
    const [name, setName] = useState('')
    const [items, setItems] = useState<Ingredient[]>([newIngredient()])
    const [servings, setServings] = useState<number | string>(1)
    const [favorite, setFavorite] = useState(false)
    const complete = items.filter(item => item.foodId && Number(item.grams) > 0)
    const preview = useMemo(() => {
        const amounts = items
            .filter(item => item.foodId && Number(item.grams) > 0)
            .flatMap(item => {
                const food = foods.find(candidate => candidate.id === item.foodId)
                return food ? [{ food, grams: Number(item.grams) }] : []
            })
        return amounts.length && Number(servings) > 0
            ? nutrientsPerServing(amounts, Number(servings))
            : null
    }, [foods, items, servings])

    const createMutation = useMutation({
        mutationFn: () =>
            createRecipe({
                name,
                servings: Number(servings),
                favorite,
                items: complete.map(item => ({ foodId: item.foodId!, grams: Number(item.grams) })),
            }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: serverQueryKeys.recipes })
            onCreated()
            setName('')
            setItems([newIngredient()])
            setServings(1)
            setFavorite(false)
            onClose()
        },
    })

    const update = (id: string, changes: Partial<Ingredient>) =>
        setItems(current => current.map(item => (item.id === id ? { ...item, ...changes } : item)))

    const error = createMutation.isError
        ? createMutation.error instanceof Error
            ? createMutation.error.message
            : 'Could not create recipe.'
        : ''

    return (
        <Modal opened={opened} onClose={onClose} title="Create recipe" centered size="md">
            <Stack>
                <TextInput
                    label="Recipe name"
                    value={name}
                    onChange={event => setName(event.currentTarget.value)}
                />
                <Text fw={650} size="sm">
                    Ingredients
                </Text>
                {items.map((item, index) => (
                    <Group key={item.id} align="end" wrap="nowrap">
                        <Select
                            label={`Ingredient ${index + 1}`}
                            value={item.foodId}
                            onChange={foodId => update(item.id, { foodId })}
                            data={foods.map(food => ({ value: food.id, label: food.name }))}
                            searchable
                            flex={1}
                        />
                        <NumberInput
                            label="Amount"
                            suffix=" g"
                            min={1}
                            value={item.grams}
                            onChange={grams => update(item.id, { grams })}
                            w={130}
                        />
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            aria-label={`Remove ingredient ${index + 1}`}
                            disabled={items.length === 1}
                            onClick={() =>
                                setItems(current => current.filter(entry => entry.id !== item.id))
                            }
                        >
                            <IconTrash size={17} />
                        </ActionIcon>
                    </Group>
                ))}
                <Button
                    variant="default"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => setItems(current => [...current, newIngredient()])}
                >
                    Add another ingredient
                </Button>
                <NumberInput
                    label="Recipe yield"
                    description="How many servings does the whole recipe make?"
                    suffix={Number(servings) === 1 ? ' serving' : ' servings'}
                    min={0.1}
                    value={servings}
                    onChange={setServings}
                />
                {preview && (
                    <Text size="sm" c="dimmed">
                        Per serving: {Math.round(preview.calories)} kcal ·{' '}
                        {Math.round(preview.protein)} g protein · {Math.round(preview.carbs)} g
                        carbs · {Math.round(preview.fat)} g fat
                    </Text>
                )}
                <Switch
                    label="Favorite recipe"
                    checked={favorite}
                    onChange={event => setFavorite(event.currentTarget.checked)}
                />
                {error && <Alert color="orange">{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" disabled={createMutation.isPending} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        loading={createMutation.isPending}
                        disabled={!name.trim() || !complete.length}
                        onClick={() => createMutation.mutate()}
                    >
                        Save recipe
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
