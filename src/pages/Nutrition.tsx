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
import { FoodCatalogLookup } from '../components/FoodCatalogLookup'
import { FoodEditModal } from '../components/FoodEditModal'
import { MealEditModal } from '../components/MealEditModal'
import { RecipeYieldModal } from '../components/RecipeYieldModal'
import { NewRecipeModal } from '../components/NewRecipeModal'
import { RecentMeals } from '../components/RecentMeals'
import { emptyNutrients, nutrientsFor, roundedNutrients, type Food } from '../domain/nutrition'
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
import { getPreferences } from '../lib/preferencesApi'

export function Nutrition() {
    const [foods, setFoods] = useState<Food[]>([])
    const [foodSearchError, setFoodSearchError] = useState('')
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
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            searchFoods(query)
                .then(records => {
                    setFoods(records)
                    setFoodSearchError('')
                })
                .catch(() => {
                    setFoods([])
                    setFoodSearchError('Your food library could not be loaded from the server.')
                })
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
        void getPreferences()
            .then(preferences => setTimezone(preferences.timezone))
            .catch(() => undefined)
    }, [refreshNutrition])

    const nutrients = useMemo(
        () => (selected ? roundedNutrients(nutrientsFor(selected, Number(grams) || 0)) : null),
        [selected, grams],
    )
    const dayFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    const todayKey = dayFormatter.format(new Date())
    const todayMeals = meals.filter(
        meal => dayFormatter.format(new Date(meal.eatenAt)) === todayKey,
    )
    const todayCalories = todayMeals.reduce(
        (total, meal) => total + (meal.nutrientSnapshot.calories ?? 0),
        0,
    )
    const todayProtein = todayMeals.reduce(
        (total, meal) => total + (meal.nutrientSnapshot.protein ?? 0),
        0,
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
                    ...emptyNutrients(),
                    ...meal.nutrientSnapshot,
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
            <div className="section-title nutrition-title">
                <div>
                    <h1>Nutrition</h1>
                    <Text className="subhead">
                        Log familiar foods quickly and keep the math visible.
                    </Text>
                </div>
                <Group className="nutrition-admin" gap="xs">
                    <FoodCatalogLookup
                        onCreated={food => setFoods(current => [food, ...current])}
                    />
                    <FoodCsvImport onImported={imported => setFoods(imported)} />
                    <Button
                        variant="default"
                        size="sm"
                        leftSection={<IconPlus size={17} />}
                        onClick={() => setCreateOpened(true)}
                    >
                        New food
                    </Button>
                    <Button
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => setRecipeOpened(true)}
                    >
                        New recipe
                    </Button>
                </Group>
            </div>
            {message && <Alert mt="md">{message}</Alert>}
            <section className="nutrition-layout">
                <article className="panel food-browser">
                    <div className="food-browser-heading">
                        <h2>Log food</h2>
                        <Text size="sm" c="dimmed">
                            Search your foods, favorites, and recent choices.
                        </Text>
                    </div>
                    <TextInput
                        size="md"
                        value={query}
                        onChange={event => setQuery(event.currentTarget.value)}
                        placeholder="Search recent and favorite foods"
                        leftSection={<IconSearch size={17} />}
                    />
                    {foodSearchError && (
                        <Alert color="orange" mt="md">
                            {foodSearchError}
                        </Alert>
                    )}
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
                        {!foodSearchError && foods.length === 0 && (
                            <div className="compact-empty">
                                <Text fw={650}>
                                    {query ? 'No matching foods' : 'Your food library is empty'}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {query
                                        ? 'Try another search, look in the external catalog, or create this food.'
                                        : 'Scan a barcode, search a configured catalog, import a file, or create your first food.'}
                                </Text>
                            </div>
                        )}
                    </Stack>
                </article>
                <article className="panel meal-composer">
                    <h2>{selected?.name ?? 'Today so far'}</h2>
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
                                {(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const).map(
                                    key => (
                                        <div className="nutrient" key={key}>
                                            <Text fw={700}>
                                                {nutrients[key]}
                                                {key === 'calories' ? '' : ' g'}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {key === 'calories' ? 'kcal' : key}
                                            </Text>
                                        </div>
                                    ),
                                )}
                            </Group>
                            <Button onClick={() => void submitMeal()}>Log for {mealType}</Button>
                            <Button variant="default" onClick={() => setEditingFood(selected)}>
                                Edit food details
                            </Button>
                        </Stack>
                    ) : (
                        <div className="nutrition-context">
                            <Text size="sm" c="dimmed">
                                Your logged meals and nutrients will build here as you add food.
                            </Text>
                            <div className="nutrition-context-grid">
                                <div>
                                    <Text fw={700}>{Math.round(todayCalories)}</Text>
                                    <Text size="xs" c="dimmed">
                                        kcal
                                    </Text>
                                </div>
                                <div>
                                    <Text fw={700}>{Math.round(todayProtein)} g</Text>
                                    <Text size="xs" c="dimmed">
                                        protein
                                    </Text>
                                </div>
                                <div>
                                    <Text fw={700}>
                                        {Math.round(
                                            todayMeals.reduce(
                                                (total, meal) =>
                                                    total + (meal.nutrientSnapshot.carbs ?? 0),
                                                0,
                                            ),
                                        )}{' '}
                                        g
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        carbs
                                    </Text>
                                </div>
                                <div>
                                    <Text fw={700}>
                                        {Math.round(
                                            todayMeals.reduce(
                                                (total, meal) =>
                                                    total + (meal.nutrientSnapshot.fat ?? 0),
                                                0,
                                            ),
                                        )}{' '}
                                        g
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        fat
                                    </Text>
                                </div>
                                <div>
                                    <Text fw={700}>
                                        {Math.round(
                                            todayMeals.reduce(
                                                (total, meal) =>
                                                    total + (meal.nutrientSnapshot.fiber ?? 0),
                                                0,
                                            ),
                                        )}{' '}
                                        g
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        fiber
                                    </Text>
                                </div>
                                <div>
                                    <Text fw={700}>{todayMeals.length}</Text>
                                    <Text size="xs" c="dimmed">
                                        meals
                                    </Text>
                                </div>
                            </div>
                            <Text size="sm" fw={600}>
                                Quick reuse
                            </Text>
                            <RecentMeals
                                meals={[...meals].sort(
                                    (left, right) => Number(right.favorite) - Number(left.favorite),
                                )}
                                onCopy={meal => void copyMeal(meal)}
                                onFavorite={meal => void toggleFavorite(meal)}
                                onEdit={setEditingMeal}
                            />
                        </div>
                    )}
                </article>
            </section>
            <section className="nutrition-secondary">
                <article className="panel">
                    <h2>Saved recipes</h2>
                    <Text size="sm" c="dimmed">
                        Reusable servings from your food library.
                    </Text>
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
                            <div className="compact-empty recipe-empty">
                                <Text c="dimmed" size="sm">
                                    No recipes yet. Saved recipes show nutrition per serving and
                                    make repeat logging faster.
                                </Text>
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={() => setRecipeOpened(true)}
                                >
                                    Add recipe
                                </Button>
                            </div>
                        )}
                    </Stack>
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
