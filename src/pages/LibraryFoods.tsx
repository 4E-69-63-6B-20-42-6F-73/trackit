import { Alert, Badge, Button, Group, Skeleton, Stack, Text, TextInput } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { IconApple, IconArrowLeft, IconPlus, IconSearch } from '@tabler/icons-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FoodCatalogLookup } from '../components/FoodCatalogLookup'
import { FoodCsvImport } from '../components/FoodCsvImport'
import { FoodEditModal } from '../components/FoodEditModal'
import { NewFoodModal } from '../components/NewFoodModal'
import { PageHeader } from '../components/PageHeader'
import type { Food } from '@trackit/domain/nutrition'
import { deleteFood, searchFoods, updateFood } from '../lib/nutritionApi'
import { serverQueryKeys } from '../lib/serverQueries'

const nutritionStatusLabel = (quality: Food['nutritionQuality']) =>
    quality === 'estimated' ? 'Estimated' : 'Incomplete'

export function LibraryFoods() {
    const queryClient = useQueryClient()
    const [query, setQuery] = useState('')
    const [debouncedQuery] = useDebouncedValue(query, 150)
    const [createFoodOpened, setCreateFoodOpened] = useState(false)
    const [editingFood, setEditingFood] = useState<Food | null>(null)
    const foodsQuery = useQuery({
        queryKey: [...serverQueryKeys.foods, debouncedQuery],
        queryFn: () => searchFoods(debouncedQuery),
    })
    const foods = foodsQuery.data ?? []

    const refreshFoods = () => queryClient.invalidateQueries({ queryKey: serverQueryKeys.foods })

    const addFoodLocally = (food: Food) => {
        if (!debouncedQuery || food.name.toLowerCase().includes(debouncedQuery.toLowerCase())) {
            queryClient.setQueryData<Food[]>(
                [...serverQueryKeys.foods, debouncedQuery],
                current => [food, ...(current ?? []).filter(item => item.id !== food.id)],
            )
        }
        void refreshFoods()
    }

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Foods"
                description="Search, create, or import reusable food definitions."
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
            {foodsQuery.isError && (
                <Alert mt="md" color="orange">
                    Your food library could not be loaded from the server.
                </Alert>
            )}
            <section className="panel">
                <Group justify="space-between" align="end" mb="md">
                    <Text size="sm" c="dimmed">
                        Reference foods used by meals and recipes.
                    </Text>
                    <Group gap="xs">
                        <FoodCatalogLookup onCreated={addFoodLocally} />
                        <FoodCsvImport onImported={() => void refreshFoods()} />
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
                    aria-label="Search food library"
                    leftSection={<IconSearch size={17} />}
                />
                <Stack gap="xs" mt="md">
                    {foodsQuery.isPending
                        ? Array.from({ length: 4 }, (_, index) => (
                              <Skeleton key={index} height={58} radius="md" />
                          ))
                        : foods.map(food => (
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
                                          {nutritionStatusLabel(food.nutritionQuality)}
                                      </Badge>
                                  )}
                              </button>
                          ))}
                    {!foodsQuery.isPending && foods.length === 0 && !foodsQuery.isError && (
                        <div className="compact-empty">
                            <Text fw={650}>
                                {query ? 'No matching foods' : 'Your food library is empty'}
                            </Text>
                            <Text size="sm" c="dimmed">
                                {query
                                    ? `Create “${query}”, search a configured catalog, or clear the search.`
                                    : 'Search a configured catalog, import a file, or create a food.'}
                            </Text>
                            {query && (
                                <Group gap="xs" mt="xs">
                                    <Button
                                        size="compact-sm"
                                        onClick={() => setCreateFoodOpened(true)}
                                    >
                                        Create “{query}”
                                    </Button>
                                    <Button
                                        size="compact-sm"
                                        variant="subtle"
                                        onClick={() => setQuery('')}
                                    >
                                        Clear search
                                    </Button>
                                </Group>
                            )}
                        </div>
                    )}
                </Stack>
            </section>

            <NewFoodModal
                opened={createFoodOpened}
                onClose={() => setCreateFoodOpened(false)}
                onCreate={addFoodLocally}
            />
            {editingFood && (
                <FoodEditModal
                    food={editingFood}
                    onClose={() => setEditingFood(null)}
                    onSave={async changes => {
                        const updated = await updateFood(editingFood, changes)
                        queryClient.setQueryData<Food[]>(
                            [...serverQueryKeys.foods, debouncedQuery],
                            current =>
                                (current ?? []).map(food =>
                                    food.id === updated.id ? updated : food,
                                ),
                        )
                        setEditingFood(updated)
                        await refreshFoods()
                    }}
                    onDelete={async () => {
                        await deleteFood(editingFood)
                        setEditingFood(null)
                        await refreshFoods()
                    }}
                />
            )}
        </div>
    )
}
