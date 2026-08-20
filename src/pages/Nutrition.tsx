import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    Alert,
    Badge,
    Button,
    Group,
    NumberInput,
    Select,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconApple, IconPlus, IconSearch, IconStar, IconStarFilled } from '@tabler/icons-react'
import { NewFoodModal } from '../components/NewFoodModal'
import { FoodCsvImport } from '../components/FoodCsvImport'
import { FoodEditModal } from '../components/FoodEditModal'
import { MealEditModal } from '../components/MealEditModal'
import { RecipeYieldModal } from '../components/RecipeYieldModal'
import { NewRecipeModal } from '../components/NewRecipeModal'
import { RecentMeals } from '../components/RecentMeals'
import { nutrientsFor, roundedNutrients, type Food } from '../domain/nutrition'
import {
    listMeals,
    listRecipes,
    logMeal,
    searchFoods,
    updateMeal,
    updateRecipeYield,
    updateFood,
    type MealRecord,
    type RecipeRecord,
} from '../lib/nutritionApi'

const exampleFoods: Food[] = [
    {
        id: 'example-oats',
        name: 'Rolled oats',
        per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6 },
        servingName: 'bowl',
        servingGrams: 50,
        favorite: true,
    },
    {
        id: 'example-yoghurt',
        name: 'Greek yoghurt',
        per100g: { calories: 97, protein: 9, carbs: 3.9, fat: 5, fiber: 0 },
        servingName: 'cup',
        servingGrams: 170,
        favorite: true,
    },
]

export function Nutrition() {
    const [foods, setFoods] = useState<Food[]>(exampleFoods)
    const [query, setQuery] = useState('')
    const [selected, setSelected] = useState<Food | null>(null)
    const [grams, setGrams] = useState<number | string>(100)
    const [quantityUnit, setQuantityUnit] = useState<'servings' | 'grams'>('servings')
    const [mealType, setMealType] = useState<string | null>('Lunch')
    const [message, setMessage] = useState('')
    const [createOpened, setCreateOpened] = useState(false)
    const [recipeOpened, setRecipeOpened] = useState(false)
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [meals, setMeals] = useState<MealRecord[]>([])
    const [editingMeal, setEditingMeal] = useState<MealRecord | null>(null)
    const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null)
    const [editingFood, setEditingFood] = useState<Food | null>(null)

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            searchFoods(query)
                .then(records => records.length && setFoods(records))
                .catch(() => undefined)
        }, 200)
        return () => window.clearTimeout(timeout)
    }, [query])

    const refreshNutrition = useCallback(() => {
        void Promise.all([listRecipes(), listMeals()])
            .then(([nextRecipes, nextMeals]) => {
                setRecipes(nextRecipes)
                setMeals(nextMeals)
            })
            .catch(() => undefined)
    }, [])

    useEffect(() => {
        refreshNutrition()
    }, [refreshNutrition])

    const nutrients = useMemo(
        () => (selected ? roundedNutrients(nutrientsFor(selected, Number(grams) || 0)) : null),
        [selected, grams],
    )

    const submitMeal = async () => {
        if (!selected || !nutrients || !mealType) return
        try {
            await logMeal(
                selected.name,
                mealType,
                nutrients,
                selected.nutritionQuality,
                selected.version ? selected.id : undefined,
            )
            setMessage(`${selected.name} added to ${mealType.toLowerCase()}.`)
            setSelected(null)
            refreshNutrition()
        } catch {
            setMessage('Connect to your TrackIt server to save this meal.')
        }
    }

    const copyMeal = async (meal: MealRecord) => {
        try {
            await logMeal(
                meal.name,
                meal.mealType,
                {
                    calories: meal.nutrientSnapshot.calories ?? 0,
                    protein: meal.nutrientSnapshot.protein ?? 0,
                    carbs: meal.nutrientSnapshot.carbs ?? 0,
                    fat: meal.nutrientSnapshot.fat ?? 0,
                    fiber: meal.nutrientSnapshot.fiber ?? 0,
                },
                meal.nutritionQuality,
            )
            setMessage(`${meal.name} logged again.`)
            refreshNutrition()
        } catch {
            setMessage('That meal could not be logged again. Try once more.')
        }
    }

    const toggleFavorite = async (meal: MealRecord) => {
        try {
            const updated = await updateMeal(meal.id, meal.version, { favorite: !meal.favorite })
            setMeals(current => current.map(item => (item.id === updated.id ? updated : item)))
        } catch {
            setMessage('The favorite could not be updated. Reload and try again.')
        }
    }

    const editMeal = async (
        changes: Parameters<typeof updateMeal>[2] & {
            name: string
            mealType: MealRecord['mealType']
            eatenAt: string
            nutrients: Record<string, number>
        },
    ) => {
        if (!editingMeal) return
        const updated = await updateMeal(editingMeal.id, editingMeal.version, changes)
        setMeals(current => current.map(item => (item.id === updated.id ? updated : item)))
        setMessage(`${updated.name} updated. Historical nutrients remain an explicit snapshot.`)
    }

    const logRecipe = async (recipe: RecipeRecord) => {
        try {
            await logMeal(
                recipe.name,
                mealType ?? 'Lunch',
                recipe.nutrientsPerServing,
                recipe.nutritionQuality,
            )
            setMessage(`${recipe.name} logged from one saved serving.`)
            refreshNutrition()
        } catch {
            setMessage('That recipe serving could not be logged. Try again.')
        }
    }

    return (
        <div className="page-content simple-page">
            <div className="section-title">
                <div>
                    <Text className="date">FOOD & FUEL</Text>
                    <h1>Nutrition</h1>
                    <Text className="subhead">
                        Log familiar foods quickly and keep the math visible.
                    </Text>
                </div>
                <Group>
                    <FoodCsvImport
                        onImported={imported => setFoods(current => [...imported, ...current])}
                    />
                    <Button
                        leftSection={<IconPlus size={17} />}
                        onClick={() => setCreateOpened(true)}
                    >
                        New food
                    </Button>
                    <Button variant="default" onClick={() => setRecipeOpened(true)}>
                        New recipe
                    </Button>
                </Group>
            </div>
            {message && <Alert mt="md">{message}</Alert>}
            <section className="nutrition-layout">
                <article className="panel food-browser">
                    <TextInput
                        value={query}
                        onChange={event => setQuery(event.currentTarget.value)}
                        placeholder="Search recent and favorite foods"
                        leftSection={<IconSearch size={17} />}
                    />
                    <Stack mt="md" gap="xs">
                        {foods.map(food => (
                            <button
                                className={`food-row ${selected?.id === food.id ? 'selected' : ''}`}
                                key={food.id}
                                onClick={() => {
                                    setSelected(food)
                                    setGrams(food.servingGrams)
                                    setQuantityUnit('servings')
                                }}
                            >
                                <div className="food-icon">
                                    <IconApple size={18} />
                                </div>
                                <div>
                                    <Text fw={600} size="sm">
                                        {food.name}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {food.per100g.calories} kcal per 100 g
                                    </Text>
                                    {food.nutritionQuality &&
                                        food.nutritionQuality !== 'complete' && (
                                            <Badge
                                                size="xs"
                                                color={
                                                    food.nutritionQuality === 'estimated'
                                                        ? 'orange'
                                                        : 'gray'
                                                }
                                                variant="light"
                                            >
                                                {food.nutritionQuality}
                                            </Badge>
                                        )}
                                </div>
                                {food.favorite ? (
                                    <IconStarFilled size={16} />
                                ) : (
                                    <IconStar size={16} />
                                )}
                            </button>
                        ))}
                    </Stack>
                </article>
                <article className="panel meal-composer">
                    <Text className="eyebrow">MEAL COMPOSER</Text>
                    <h2>{selected?.name ?? 'Choose a food'}</h2>
                    {selected && nutrients ? (
                        <Stack>
                            <NumberInput
                                label="Amount"
                                value={
                                    quantityUnit === 'servings'
                                        ? Number(grams) / selected.servingGrams
                                        : grams
                                }
                                onChange={value =>
                                    setGrams(
                                        quantityUnit === 'servings'
                                            ? (Number(value) || 0) * selected.servingGrams
                                            : value,
                                    )
                                }
                                suffix={
                                    quantityUnit === 'servings' ? ` ${selected.servingName}` : ' g'
                                }
                                decimalScale={2}
                                min={0.01}
                            />
                            <SegmentedControl
                                fullWidth
                                aria-label="Quantity unit"
                                value={quantityUnit}
                                onChange={value => setQuantityUnit(value as 'servings' | 'grams')}
                                data={[
                                    { label: selected.servingName, value: 'servings' },
                                    { label: 'grams', value: 'grams' },
                                ]}
                            />
                            <Select
                                label="Meal"
                                value={mealType}
                                onChange={setMealType}
                                data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                            />
                            <Group grow>
                                {(['calories', 'protein', 'carbs', 'fat'] as const).map(key => (
                                    <div className="nutrient" key={key}>
                                        <Text fw={700}>
                                            {nutrients[key]}
                                            {key === 'calories' ? '' : ' g'}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {key === 'calories' ? 'kcal' : key}
                                        </Text>
                                    </div>
                                ))}
                            </Group>
                            <Button onClick={() => void submitMeal()}>Add to {mealType}</Button>
                            <Button variant="default" onClick={() => setEditingFood(selected)}>
                                Edit food details
                            </Button>
                        </Stack>
                    ) : (
                        <Text c="dimmed" size="sm">
                            Select a recent or favorite food to begin.
                        </Text>
                    )}
                </article>
            </section>
            <section className="nutrition-secondary">
                <article className="panel">
                    <Text className="eyebrow">SAVED RECIPES</Text>
                    <h2>Reusable servings</h2>
                    <Stack gap="xs">
                        {recipes.length ? (
                            recipes.map(recipe => (
                                <Group key={recipe.id} justify="space-between" wrap="nowrap">
                                    <div>
                                        {recipe.nutritionQuality !== 'complete' && (
                                            <Badge
                                                size="xs"
                                                variant="light"
                                                color={
                                                    recipe.nutritionQuality === 'estimated'
                                                        ? 'orange'
                                                        : 'gray'
                                                }
                                            >
                                                {recipe.nutritionQuality}
                                            </Badge>
                                        )}
                                        <Text size="sm" fw={600}>
                                            {recipe.name}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {Math.round(recipe.nutrientsPerServing.calories)} kcal
                                            per serving · yields {recipe.servings}
                                        </Text>
                                    </div>
                                    <Button size="xs" onClick={() => void logRecipe(recipe)}>
                                        Log serving
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="default"
                                        onClick={() => setEditingRecipe(recipe)}
                                    >
                                        Edit yield
                                    </Button>
                                </Group>
                            ))
                        ) : (
                            <Text c="dimmed">Create a recipe to reuse a calculated serving.</Text>
                        )}
                    </Stack>
                </article>
                <article className="panel">
                    <Text className="eyebrow">RECENT & FAVORITE</Text>
                    <h2>Repeat a meal</h2>
                    <RecentMeals
                        meals={[...meals].sort(
                            (left, right) => Number(right.favorite) - Number(left.favorite),
                        )}
                        onCopy={meal => void copyMeal(meal)}
                        onFavorite={meal => void toggleFavorite(meal)}
                        onEdit={setEditingMeal}
                    />
                </article>
            </section>
            <NewFoodModal
                opened={createOpened}
                onClose={() => setCreateOpened(false)}
                onCreate={food => setFoods(current => [food, ...current])}
            />
            <NewRecipeModal
                opened={recipeOpened}
                onClose={() => setRecipeOpened(false)}
                foods={foods}
                onCreated={refreshNutrition}
            />
            {editingMeal && (
                <MealEditModal
                    key={editingMeal.id}
                    meal={editingMeal}
                    onClose={() => setEditingMeal(null)}
                    onSave={editMeal}
                />
            )}
            {editingRecipe && (
                <RecipeYieldModal
                    key={editingRecipe.id}
                    recipe={editingRecipe}
                    onClose={() => setEditingRecipe(null)}
                    onSave={async servings => {
                        await updateRecipeYield(editingRecipe, servings)
                        refreshNutrition()
                    }}
                />
            )}
            {editingFood && (
                <FoodEditModal
                    key={editingFood.id}
                    food={editingFood}
                    onClose={() => setEditingFood(null)}
                    onSave={async changes => {
                        const updated = await updateFood(editingFood, changes)
                        setFoods(current =>
                            current.map(food => (food.id === updated.id ? updated : food)),
                        )
                        setSelected(updated)
                        setMessage(
                            'Food updated. Previously logged meals keep their nutrient snapshots.',
                        )
                    }}
                />
            )}
        </div>
    )
}
