import { useEffect, useState } from 'react'
import { Alert, Badge, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { IconApple, IconArrowLeft, IconPlus, IconSearch } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { FoodCatalogLookup } from '../components/FoodCatalogLookup'
import { FoodCsvImport } from '../components/FoodCsvImport'
import { FoodEditModal } from '../components/FoodEditModal'
import { NewFoodModal } from '../components/NewFoodModal'
import { PageHeader } from '../components/PageHeader'
import type { Food } from '../domain/nutrition'
import { deleteFood, searchFoods, updateFood } from '../lib/nutritionApi'

const nutritionStatusLabel = (quality: Food['nutritionQuality']) =>
    quality === 'estimated' ? 'Estimated' : 'Incomplete'

export function LibraryFoods() {
    const [foods, setFoods] = useState<Food[]>([])
    const [query, setQuery] = useState('')
    const [message, setMessage] = useState('')
    const [createFoodOpened, setCreateFoodOpened] = useState(false)
    const [editingFood, setEditingFood] = useState<Food | null>(null)

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            void searchFoods(query)
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

    const addFoodLocally = (food: Food) => {
        if (!query || food.name.toLowerCase().includes(query.toLowerCase())) {
            setFoods(current => [food, ...current.filter(item => item.id !== food.id)])
        }
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
            {message && (
                <Alert mt="md" color="orange">
                    {message}
                </Alert>
            )}
            <section className="panel">
                <Group justify="space-between" align="end" mb="md">
                    <Text size="sm" c="dimmed">
                        Reference foods used by meals and recipes.
                    </Text>
                    <Group gap="xs">
                        <FoodCatalogLookup onCreated={addFoodLocally} />
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
                    aria-label="Search food library"
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
                                    {nutritionStatusLabel(food.nutritionQuality)}
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
                        setFoods(current =>
                            current.map(food => (food.id === updated.id ? updated : food)),
                        )
                    }}
                    onDelete={async () => {
                        await deleteFood(editingFood)
                        setFoods(current => current.filter(food => food.id !== editingFood.id))
                    }}
                />
            )}
        </div>
    )
}
