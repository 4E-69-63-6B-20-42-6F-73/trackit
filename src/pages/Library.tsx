import { useCallback, useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconApple, IconChevronRight, IconPlus, IconSearch } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { FoodCatalogLookup } from '../components/FoodCatalogLookup'
import { FoodCsvImport } from '../components/FoodCsvImport'
import { FoodEditModal } from '../components/FoodEditModal'
import { NewFoodModal } from '../components/NewFoodModal'
import { NewRecipeModal } from '../components/NewRecipeModal'
import { PageHeader } from '../components/PageHeader'
import { RecipeYieldModal } from '../components/RecipeYieldModal'
import type { Food } from '../domain/nutrition'
import {
    listRecipes,
    searchFoods,
    updateFood,
    updateRecipeYield,
    type RecipeRecord,
} from '../lib/nutritionApi'

export function Library() {
    const [foods, setFoods] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [query, setQuery] = useState('')
    const [message, setMessage] = useState('')
    const [createFoodOpened, setCreateFoodOpened] = useState(false)
    const [createRecipeOpened, setCreateRecipeOpened] = useState(false)
    const [editingFood, setEditingFood] = useState<Food | null>(null)
    const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null)

    const refreshRecipes = useCallback(() => {
        void listRecipes()
            .then(setRecipes)
            .catch(() => setMessage('Your recipes could not be loaded from the server.'))
    }, [])

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            searchFoods(query)
                .then(records => {
                    setFoods(records)
                    setMessage('')
                })
                .catch(() => {
                    setFoods([])
                    setMessage('Your food library could not be loaded from the server.')
                })
        }, 150)
        return () => window.clearTimeout(timeout)
    }, [query])

    useEffect(() => refreshRecipes(), [refreshRecipes])

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Library"
                description="Manage reusable foods, recipes, and how TrackIt understands metrics."
                actions={
                    <Button
                        component={Link}
                        to="/library/metrics"
                        variant="default"
                        rightSection={<IconChevronRight size={16} />}
                    >
                        Metric Center
                    </Button>
                }
            />
            {message && (
                <Alert mt="md" color="orange">
                    {message}
                </Alert>
            )}

            <section className="panel" style={{ marginTop: '1rem' }}>
                <Group justify="space-between" align="end" mb="md">
                    <div>
                        <h2>Foods</h2>
                        <Text size="sm" c="dimmed">
                            Reference foods used by the meal logger and recipes.
                        </Text>
                    </div>
                    <Group gap="xs">
                        <FoodCatalogLookup
                            onCreated={food => setFoods(current => [food, ...current])}
                        />
                        <FoodCsvImport onImported={setFoods} />
                        <Button
                            size="sm"
                            leftSection={<IconPlus size={16} />}
                            onClick={() => setCreateFoodOpened(true)}
                        >
                            New food
                        </Button>
                    </Group>
                </Group>
                <TextInput
                    value={query}
                    onChange={event => setQuery(event.currentTarget.value)}
                    placeholder="Search foods"
                    leftSection={<IconSearch size={17} />}
                />
                <Stack gap="xs" mt="md">
                    {foods.map(food => (
                        <button
                            className="food-row"
                            key={food.id}
                            onClick={() => setEditingFood(food)}
                        >
                            <div className="food-icon">
                                <IconApple size={18} />
                            </div>
                            <div>
                                <Text fw={600} size="sm">
                                    {food.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {food.brand ? `${food.brand} · ` : ''}
                                    {food.per100g.calories ?? '—'} kcal per 100 g
                                </Text>
                            </div>
                            {food.nutritionQuality !== 'complete' && (
                                <Badge size="xs" variant="light">
                                    {food.nutritionQuality}
                                </Badge>
                            )}
                        </button>
                    ))}
                    {foods.length === 0 && !message && (
                        <div className="compact-empty">
                            <Text fw={650}>
                                {query ? 'No matching foods' : 'Your food library is empty'}
                            </Text>
                            <Text size="sm" c="dimmed">
                                Search a configured catalog, import a file, or create a food.
                            </Text>
                        </div>
                    )}
                </Stack>
            </section>

            <section className="panel" style={{ marginTop: '1rem' }}>
                <Group justify="space-between" mb="md">
                    <div>
                        <h2>Recipes</h2>
                        <Text size="sm" c="dimmed">
                            Reusable combinations of foods. Logged meals keep their historical
                            nutrient snapshot.
                        </Text>
                    </div>
                    <Button
                        variant="default"
                        size="sm"
                        leftSection={<IconPlus size={16} />}
                        disabled={foods.length === 0}
                        onClick={() => setCreateRecipeOpened(true)}
                    >
                        New recipe
                    </Button>
                </Group>
                <Stack gap="xs">
                    {recipes.map(recipe => (
                        <button
                            className="food-row"
                            key={recipe.id}
                            onClick={() => setEditingRecipe(recipe)}
                        >
                            <div>
                                <Text fw={600} size="sm">
                                    {recipe.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {recipe.servings}{' '}
                                    {recipe.servings === 1 ? 'serving' : 'servings'} ·{' '}
                                    {Math.round(recipe.nutrientsPerServing.calories)} kcal per serving
                                </Text>
                            </div>
                        </button>
                    ))}
                    {recipes.length === 0 && (
                        <div className="compact-empty">
                            <Text fw={650}>No recipes yet</Text>
                            <Text size="sm" c="dimmed">
                                Create a recipe from foods in your library.
                            </Text>
                        </div>
                    )}
                </Stack>
            </section>

            <NewFoodModal
                opened={createFoodOpened}
                onClose={() => setCreateFoodOpened(false)}
                onCreate={food => setFoods(current => [food, ...current])}
            />
            <NewRecipeModal
                opened={createRecipeOpened}
                onClose={() => setCreateRecipeOpened(false)}
                foods={foods}
                onCreated={refreshRecipes}
            />
            {editingFood && (
                <FoodEditModal
                    food={editingFood}
                    onClose={() => setEditingFood(null)}
                    onSave={async changes => {
                        const updated = await updateFood(editingFood, changes)
                        setFoods(current =>
                            current.map(food => (food.id === updated.id ? updated : food)),
                        )
                    }}
                />
            )}
            {editingRecipe && (
                <RecipeYieldModal
                    recipe={editingRecipe}
                    onClose={() => setEditingRecipe(null)}
                    onSave={async servings => {
                        await updateRecipeYield(editingRecipe, servings)
                        refreshRecipes()
                    }}
                />
            )}
        </div>
    )
}
