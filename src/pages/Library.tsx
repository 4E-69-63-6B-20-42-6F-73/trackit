import { useEffect, useState } from 'react'
import { Alert, Group, Paper, SimpleGrid, Text } from '@mantine/core'
import { IconApple, IconChartDots, IconChefHat, IconChevronRight } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { listRecipes, searchFoods } from '../lib/nutritionApi'

export function Library() {
    const [foodCount, setFoodCount] = useState(0)
    const [recipeCount, setRecipeCount] = useState(0)
    const [message, setMessage] = useState('')

    useEffect(() => {
        let active = true
        void Promise.all([searchFoods(''), listRecipes()])
            .then(([foods, recipes]) => {
                if (!active) return
                setFoodCount(foods.length)
                setRecipeCount(recipes.length)
                setMessage('')
            })
            .catch(() => {
                if (active) setMessage('Your library could not be loaded from the server.')
            })
        return () => {
            active = false
        }
    }, [])

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Library"
                description="Reusable reference data for logging, recipes, and metric behavior."
            />
            {message && (
                <Alert mt="md" color="orange">
                    {message}
                </Alert>
            )}

            <SimpleGrid cols={{ base: 1, sm: 3 }} mt="md" mb="lg">
                <Paper
                    component={Link}
                    to="/library/foods"
                    aria-label="Browse foods"
                    withBorder
                    p="md"
                    radius="md"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                >
                    <Group justify="space-between" align="start">
                        <IconApple size={22} />
                        <Text size="xs" c="dimmed">
                            {foodCount}
                        </Text>
                    </Group>
                    <Text fw={700} mt="sm">
                        Foods
                    </Text>
                    <Text size="sm" c="dimmed" mb="sm">
                        Reference foods used by meals and recipes.
                    </Text>
                    <Group gap={4} c="var(--teal)">
                        <Text size="sm" fw={600}>
                            Browse foods
                        </Text>
                        <IconChevronRight size={14} />
                    </Group>
                </Paper>
                <Paper
                    component={Link}
                    to="/library/recipes"
                    aria-label="Browse recipes"
                    withBorder
                    p="md"
                    radius="md"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                >
                    <Group justify="space-between" align="start">
                        <IconChefHat size={22} />
                        <Text size="xs" c="dimmed">
                            {recipeCount}
                        </Text>
                    </Group>
                    <Text fw={700} mt="sm">
                        Recipes
                    </Text>
                    <Text size="sm" c="dimmed" mb="sm">
                        Reusable combinations with stable serving yields.
                    </Text>
                    <Group gap={4} c="var(--teal)">
                        <Text size="sm" fw={600}>
                            Browse recipes
                        </Text>
                        <IconChevronRight size={14} />
                    </Group>
                </Paper>
                <Paper
                    component={Link}
                    to="/library/metrics"
                    aria-label="Open Metric Center"
                    withBorder
                    p="md"
                    radius="md"
                    style={{ color: 'inherit', textDecoration: 'none' }}
                >
                    <IconChartDots size={22} />
                    <Text fw={700} mt="sm">
                        Metric Center
                    </Text>
                    <Text size="sm" c="dimmed" mb="sm">
                        Units, definitions, and how TrackIt interprets metrics.
                    </Text>
                    <Group gap={4} c="var(--teal)">
                        <Text size="sm" fw={600}>
                            Open Metric Center
                        </Text>
                        <IconChevronRight size={14} />
                    </Group>
                </Paper>
            </SimpleGrid>
        </div>
    )
}
