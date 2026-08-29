import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { IconArrowLeft, IconPlus } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { NewRecipeModal } from '../components/NewRecipeModal'
import { PageHeader } from '../components/PageHeader'
import { RecipeYieldModal } from '../components/RecipeYieldModal'
import type { Food } from '../domain/nutrition'
import {
    listRecipes,
    searchFoods,
    updateRecipeYield,
    type RecipeRecord,
} from '../lib/nutritionApi'

export function LibraryRecipes() {
    const [foods, setFoods] = useState<Food[]>([])
    const [recipes, setRecipes] = useState<RecipeRecord[]>([])
    const [message, setMessage] = useState('')
    const [createRecipeOpened, setCreateRecipeOpened] = useState(false)
    const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null)

    const refreshRecipes = useCallback(() => {
        void listRecipes()
            .then(records => {
                setRecipes(records)
                setMessage('')
            })
            .catch(() => setMessage('Your recipes could not be loaded from the server.'))
    }, [])

    useEffect(() => {
        void searchFoods('')
            .then(setFoods)
            .catch(() => setMessage('Your food library could not be loaded from the server.'))
        refreshRecipes()
    }, [refreshRecipes])

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Recipes"
                description="Reusable combinations of foods with stable serving yields."
                actions={
                    <Button
                        component={Link}
                        to="/library"
                        variant="subtle"
                        color="gray"
                        leftSection={<IconArrowLeft size={16} />}
                    >
                        Back to Library
                    </Button>
                }
            />
            {message && (
                <Alert mt="md" color="orange">
                    {message}
                </Alert>
            )}
            <section className="panel">
                <Group justify="space-between" mb="md">
                    <Text size="sm" c="dimmed">
                        Logged meals keep their historical nutrient snapshot when recipes change.
                    </Text>
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
                    {recipes.length === 0 && !message && (
                        <div className="compact-empty">
                            <Text fw={650}>No recipes yet</Text>
                            <Text size="sm" c="dimmed">
                                {foods.length
                                    ? 'Create a recipe from foods in your library.'
                                    : 'Add at least one food before creating a recipe.'}
                            </Text>
                        </div>
                    )}
                </Stack>
            </section>

            <NewRecipeModal
                opened={createRecipeOpened}
                onClose={() => setCreateRecipeOpened(false)}
                foods={foods}
                onCreated={refreshRecipes}
            />
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
