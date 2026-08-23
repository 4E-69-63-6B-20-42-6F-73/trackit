import { useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { nutrientsFor, roundedNutrients, type Food, type Nutrients } from '../../domain/nutrition'
import { listRecipes, logMeal, searchFoods, type RecipeRecord } from '../../lib/nutritionApi'
import { FoodCatalogLookup } from '../FoodCatalogLookup'
import { NewFoodModal } from '../NewFoodModal'

type Selection =
    | { kind: 'food'; food: Food }
    | { kind: 'recipe'; recipe: RecipeRecord }
    | null

const selectedTimestamp = (selectedDate?: string | null) => {
    const now = new Date()
    if (!selectedDate) return now.toISOString()
    const [year, month, day] = selectedDate.split('-').map(Number)
    return new Date(year, month - 1, day, now.getHours(), now.getMinutes()).toISOString()
}

export function FoodLogger({
    opened,
    close,
    selectedDate,
}: {
    opened: boolean
    close: () => void
    selectedDate?: string | null
}) {
    const hour = new Date().getHours()
    const [mealType, setMealType] = useState(
        hour < 11 ? 'Breakfast' : hour < 15 ? 'Lunch' : hour < 21 ? 'Dinner' : 'Snack',
    )
    const [query, setQuery] = useState('')
    const [foods, setFoods] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [view, setView] = useState('recent')
    const [selection, setSelection] = useState<Selection>(null)
    const [amount, setAmount] = useState<number | string>(100)
    const [creating, setCreating] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (!opened) return
        let active = true
        void Promise.all([searchFoods(query), listRecipes()])
            .then(([nextFoods, nextRecipes]) => {
                if (!active) return
                setFoods(nextFoods)
                setRecipes(nextRecipes)
                setError('')
            })
            .catch(() => active && setError('Your food library could not be loaded.'))
        return () => {
            active = false
        }
    }, [opened, query])

    const visibleFoods = foods.filter(food => view !== 'favorites' || food.favorite)
    const visibleRecipes = recipes.filter(recipe => view !== 'favorites' || recipe.favorite)
    const nutrients: Partial<Nutrients> | null = useMemo(() => {
        if (!selection) return null
        return selection.kind === 'food'
            ? roundedNutrients(nutrientsFor(selection.food, Number(amount) || 0))
            : roundedNutrients(
                  Object.fromEntries(
                      Object.entries(selection.recipe.nutrientsPerServing).map(([key, value]) => [
                          key,
                          value * (Number(amount) || 0),
                      ]),
                  ) as Nutrients,
              )
    }, [amount, selection])

    const save = async () => {
        if (!selection || !nutrients) return
        setBusy(true)
        setError('')
        try {
            const name = selection.kind === 'food' ? selection.food.name : selection.recipe.name
            const quality =
                selection.kind === 'food'
                    ? selection.food.nutritionQuality
                    : selection.recipe.nutritionQuality
            await logMeal(
                name,
                mealType,
                nutrients,
                quality,
                selection.kind === 'food' ? selection.food.id : undefined,
                selectedTimestamp(selectedDate),
            )
            window.dispatchEvent(new Event('trackit:nutrition-changed'))
            close()
        } catch {
            setError('This meal could not be saved. Try again.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <Modal opened={opened} onClose={close} title="Log food" size="lg" className="food-logger">
                <Stack>
                    <SegmentedControl
                        fullWidth
                        value={mealType}
                        onChange={setMealType}
                        data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                    />
                    {!selection ? (
                        <>
                            <TextInput
                                autoFocus
                                label="Search foods and recipes"
                                placeholder="Greek yoghurt"
                                value={query}
                                onChange={event => setQuery(event.currentTarget.value)}
                                leftSection={<IconSearch size={17} />}
                            />
                            <SegmentedControl
                                value={view}
                                onChange={setView}
                                data={[
                                    { value: 'recent', label: 'Recent' },
                                    { value: 'favorites', label: 'Favorites' },
                                    { value: 'recipes', label: 'Recipes' },
                                ]}
                            />
                            <div className="food-logger-results">
                                {view !== 'recipes' &&
                                    visibleFoods.map(food => (
                                        <button
                                            type="button"
                                            key={food.id}
                                            onClick={() => {
                                                setSelection({ kind: 'food', food })
                                                setAmount(food.servingGrams)
                                            }}
                                        >
                                            <span>{food.name}</span>
                                            <small>{food.brand || `${food.servingGrams} g serving`}</small>
                                        </button>
                                    ))}
                                {(view === 'recipes' || query) &&
                                    visibleRecipes
                                        .filter(recipe =>
                                            recipe.name.toLowerCase().includes(query.toLowerCase()),
                                        )
                                        .map(recipe => (
                                            <button
                                                type="button"
                                                key={recipe.id}
                                                onClick={() => {
                                                    setSelection({ kind: 'recipe', recipe })
                                                    setAmount(1)
                                                }}
                                            >
                                                <span>{recipe.name}</span>
                                                <small>Recipe · per serving</small>
                                            </button>
                                        ))}
                                {visibleFoods.length === 0 && visibleRecipes.length === 0 && (
                                    <Text size="sm" c="dimmed">No matching saved foods or recipes.</Text>
                                )}
                            </div>
                            <Text size="sm" fw={650}>More</Text>
                            <Group>
                                <FoodCatalogLookup onCreated={food => setFoods(current => [food, ...current])} />
                                <Button variant="default" onClick={() => setCreating(true)}>
                                    Create food
                                </Button>
                            </Group>
                        </>
                    ) : (
                        <>
                            <div>
                                <Text fw={700} size="lg">
                                    {selection.kind === 'food'
                                        ? selection.food.name
                                        : selection.recipe.name}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    Choose how much you consumed.
                                </Text>
                            </div>
                            <NumberInput
                                autoFocus
                                label={selection.kind === 'food' ? 'Serving' : 'Servings'}
                                value={amount}
                                onChange={setAmount}
                                min={0.01}
                                decimalScale={2}
                                suffix={selection.kind === 'food' ? ' g' : ''}
                            />
                            <Group grow className="food-nutrient-preview">
                                <Text>
                                    <strong>{nutrients?.calories ?? '—'}</strong>
                                    <br />
                                    <small>kcal</small>
                                </Text>
                                <Text>
                                    <strong>{nutrients?.protein ?? '—'} g</strong>
                                    <br />
                                    <small>protein</small>
                                </Text>
                                <Text>
                                    <strong>{nutrients?.carbs ?? '—'} g</strong>
                                    <br />
                                    <small>carbs</small>
                                </Text>
                                <Text>
                                    <strong>{nutrients?.fat ?? '—'} g</strong>
                                    <br />
                                    <small>fat</small>
                                </Text>
                            </Group>
                            <Group justify="space-between">
                                <Button variant="subtle" onClick={() => setSelection(null)}>Back</Button>
                                <Button loading={busy} onClick={() => void save()}>
                                    Add to {mealType.toLowerCase()}
                                </Button>
                            </Group>
                        </>
                    )}
                    {error && <Alert color="orange">{error}</Alert>}
                </Stack>
            </Modal>
            <NewFoodModal
                opened={creating}
                onClose={() => setCreating(false)}
                onCreate={food => {
                    setFoods(current => [food, ...current])
                    setSelection({ kind: 'food', food })
                    setAmount(food.servingGrams)
                    setCreating(false)
                }}
            />
        </>
    )
}
