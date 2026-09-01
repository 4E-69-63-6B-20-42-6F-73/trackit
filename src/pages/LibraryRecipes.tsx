import { Alert, Button, Group, Skeleton, Stack, Text } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconArrowLeft, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { NewRecipeModal } from '../components/NewRecipeModal'
import { PageHeader } from '../components/PageHeader'
import { RecipeYieldModal } from '../components/RecipeYieldModal'
import { listRecipes, searchFoods, updateRecipeYield, type RecipeRecord } from '../lib/nutritionApi'
import { serverQueryKeys } from '../lib/serverQueries'

export function LibraryRecipes() {
    const queryClient = useQueryClient()
    const [createRecipeOpened, setCreateRecipeOpened] = useState(false)
    const [editingRecipe, setEditingRecipe] = useState<RecipeRecord | null>(null)
    const foodsQuery = useQuery({
        queryKey: [...serverQueryKeys.foods, ''],
        queryFn: () => searchFoods(''),
    })
    const recipesQuery = useQuery({
        queryKey: serverQueryKeys.recipes,
        queryFn: () => listRecipes(),
    })
    const foods = foodsQuery.data ?? []
    const recipes = recipesQuery.data ?? []
    const loading = foodsQuery.isPending || recipesQuery.isPending
    const unavailable = foodsQuery.isError || recipesQuery.isError
    const refreshRecipes = () =>
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.recipes })

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
            {unavailable && (
                <Alert mt="md" color="orange">
                    Your recipes could not be loaded from the server.
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
                        disabled={loading || foods.length === 0}
                        onClick={() => setCreateRecipeOpened(true)}
                    >
                        New recipe
                    </Button>
                </Group>
                <Stack gap="xs">
                    {loading
                        ? Array.from({ length: 3 }, (_, index) => (
                              <Skeleton key={index} height={58} radius="md" />
                          ))
                        : recipes.map(recipe => (
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
                                          {Math.round(recipe.nutrientsPerServing.calories)} kcal per
                                          serving
                                      </Text>
                                  </div>
                              </button>
                          ))}
                    {!loading && recipes.length === 0 && !unavailable && (
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
                onCreated={() => void refreshRecipes()}
            />
            {editingRecipe && (
                <RecipeYieldModal
                    recipe={editingRecipe}
                    onClose={() => setEditingRecipe(null)}
                    onSave={async servings => {
                        await updateRecipeYield(editingRecipe, servings)
                        setEditingRecipe(null)
                        await refreshRecipes()
                    }}
                />
            )}
        </div>
    )
}
