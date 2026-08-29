import { useCallback, useEffect, useState } from 'react'
import {
    Alert,
    Badge,
    Button,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Tabs,
    Text,
    TextInput,
} from '@mantine/core'
import { IconApple, IconChartDots, IconChefHat, IconChevronRight, IconPlus, IconSearch } from '@tabler/icons-react'
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
    const [tab, setTab] = useState<string | null>('foods')
    const [foods, setFoods] = useState<Food[]>([])
    const [allFoods, setAllFoods] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [query, setQuery] = useState('')
    const [message, setMessage] = useState('')
    const [createFoodOpened, setCreateFoodOpened] = useState(false)
    const [createRecipeOpened, setCreateRecipeOpened] = useState(false)
    const [editingFood, setEditingFood] = useState<Food | null>(null)
    const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null)

    const refreshAllFoods = useCallback(() => {
        void searchFoods('')
            .then(setAllFoods)
            .catch(() => setMessage('Your food library could not be loaded from the server.'))
    }, [])
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

    useEffect(() => {
        refreshAllFoods()
        refreshRecipes()
    }, [refreshAllFoods, refreshRecipes])

    const addFoodLocally = (food: Food) => {
        setAllFoods(current => [food, ...current.filter(item => item.id !== food.id)])
        if (!query || food.name.toLowerCase().includes(query.toLowerCase()))
            setFoods(current => [food, ...current.filter(item => item.id !== food.id)])
    }

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Library"
                description="Reusable reference data for logging, recipes, and metric behavior."
            />
            {message && <Alert mt="md" color="orange">{message}</Alert>}

            <SimpleGrid cols={{ base: 1, sm: 3 }} mt="md" mb="lg">
                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" align="start">
                        <IconApple size={22} />
                        <Text size="xs" c="dimmed">{allFoods.length}</Text>
                    </Group>
                    <Text fw={700} mt="sm">Foods</Text>
                    <Text size="sm" c="dimmed" mb="sm">Reference foods used by meals and recipes.</Text>
                    <Button variant="subtle" size="compact-sm" onClick={() => setTab('foods')}>Browse foods</Button>
                </Paper>
                <Paper withBorder p="md" radius="md">
                    <Group justify="space-between" align="start">
                        <IconChefHat size={22} />
                        <Text size="xs" c="dimmed">{recipes.length}</Text>
                    </Group>
                    <Text fw={700} mt="sm">Recipes</Text>
                    <Text size="sm" c="dimmed" mb="sm">Reusable combinations with stable serving yields.</Text>
                    <Button variant="subtle" size="compact-sm" onClick={() => setTab('recipes')}>Browse recipes</Button>
                </Paper>
                <Paper withBorder p="md" radius="md">
                    <IconChartDots size={22} />
                    <Text fw={700} mt="sm">Metric Center</Text>
                    <Text size="sm" c="dimmed" mb="sm">Units, definitions, and how TrackIt interprets metrics.</Text>
                    <Button
                        component={Link}
                        to="/library/metrics"
                        variant="subtle"
                        size="compact-sm"
                        rightSection={<IconChevronRight size={14} />}
                    >
                        Open Metric Center
                    </Button>
                </Paper>
            </SimpleGrid>

            <Tabs value={tab} onChange={setTab} keepMounted={false}>
                <Tabs.List mb="md">
                    <Tabs.Tab value="foods" leftSection={<IconApple size={16} />}>Foods</Tabs.Tab>
                    <Tabs.Tab value="recipes" leftSection={<IconChefHat size={16} />}>Recipes</Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="foods">
                    <section className="panel">
                        <Group justify="space-between" align="end" mb="md">
                            <div>
                                <h2>Foods</h2>
                                <Text size="sm" c="dimmed">Search, create, or import reusable food definitions.</Text>
                            </div>
                            <Group gap="xs">
                                <FoodCatalogLookup onCreated={addFoodLocally} />
                                <FoodCsvImport
                                    onImported={records => {
                                        setFoods(records)
                                        refreshAllFoods()
                                    }}
                                />
                                <Button size="sm" leftSection={<IconPlus size={16} />} onClick={() => setCreateFoodOpened(true)}>
                                    New food
                                </Button>
                            </Group>
                        </Group>
                        <TextInput
                            value={query}
                            onChange={event => setQuery(event.currentTarget.value)}
                            placeholder="Search foods"
                            aria-label="Search food library"
                            leftSection={<IconSearch size={17} />}
                        />
                        <Stack gap="xs" mt="md">
                            {foods.map(food => (
                                <button className="food-row" key={food.id} onClick={() => setEditingFood(food)}>
                                    <div className="food-icon"><IconApple size={18} /></div>
                                    <div>
                                        <Text fw={600} size="sm">{food.name}</Text>
                                        <Text size="xs" c="dimmed">
                                            {food.brand ? `${food.brand} · ` : ''}{food.per100g.calories ?? '—'} kcal per 100 g
                                        </Text>
                                    </div>
                                    {food.nutritionQuality !== 'complete' && (
                                        <Badge size="xs" variant="light">{food.nutritionQuality}</Badge>
                                    )}
                                </button>
                            ))}
                            {foods.length === 0 && !message && (
                                <div className="compact-empty">
                                    <Text fw={650}>{query ? 'No matching foods' : 'Your food library is empty'}</Text>
                                    <Text size="sm" c="dimmed">
                                        {query
                                            ? `Create “${query}”, search a configured catalog, or clear the search.`
                                            : 'Search a configured catalog, import a file, or create a food.'}
                                    </Text>
                                    {query && (
                                        <Group gap="xs" mt="xs">
                                            <Button size="compact-sm" onClick={() => setCreateFoodOpened(true)}>Create “{query}”</Button>
                                            <Button size="compact-sm" variant="subtle" onClick={() => setQuery('')}>Clear search</Button>
                                        </Group>
                                    )}
                                </div>
                            )}
                        </Stack>
                    </section>
                </Tabs.Panel>

                <Tabs.Panel value="recipes">
                    <section className="panel">
                        <Group justify="space-between" mb="md">
                            <div>
                                <h2>Recipes</h2>
                                <Text size="sm" c="dimmed">Reusable combinations of foods. Logged meals keep their historical nutrient snapshot.</Text>
                            </div>
                            <Button
                                variant="default"
                                size="sm"
                                leftSection={<IconPlus size={16} />}
                                disabled={allFoods.length === 0}
                                onClick={() => setCreateRecipeOpened(true)}
                            >
                                New recipe
                            </Button>
                        </Group>
                        <Stack gap="xs">
                            {recipes.map(recipe => (
                                <button className="food-row" key={recipe.id} onClick={() => setEditingRecipe(recipe)}>
                                    <div>
                                        <Text fw={600} size="sm">{recipe.name}</Text>
                                        <Text size="xs" c="dimmed">
                                            {recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'} · {Math.round(recipe.nutrientsPerServing.calories)} kcal per serving
                                        </Text>
                                    </div>
                                </button>
                            ))}
                            {recipes.length === 0 && (
                                <div className="compact-empty">
                                    <Text fw={650}>No recipes yet</Text>
                                    <Text size="sm" c="dimmed">
                                        {allFoods.length
                                            ? 'Create a recipe from foods in your library.'
                                            : 'Add at least one food before creating a recipe.'}
                                    </Text>
                                </div>
                            )}
                        </Stack>
                    </section>
                </Tabs.Panel>
            </Tabs>

            <NewFoodModal
                opened={createFoodOpened}
                onClose={() => setCreateFoodOpened(false)}
                onCreate={addFoodLocally}
            />
            <NewRecipeModal
                opened={createRecipeOpened}
                onClose={() => setCreateRecipeOpened(false)}
                foods={allFoods}
                onCreated={refreshRecipes}
            />
            {editingFood && (
                <FoodEditModal
                    food={editingFood}
                    onClose={() => setEditingFood(null)}
                    onSave={async changes => {
                        const updated = await updateFood(editingFood, changes)
                        setFoods(current => current.map(food => (food.id === updated.id ? updated : food)))
                        setAllFoods(current => current.map(food => (food.id === updated.id ? updated : food)))
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
