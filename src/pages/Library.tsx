import { useEffect, useState } from 'react'
import { Alert, Button, Group, Paper, SimpleGrid, Text } from '@mantine/core'
import {
    IconApple,
    IconChartDots,
    IconChefHat,
    IconChevronRight,
} from '@tabler/icons-react'
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
                <Paper withBorder p="md" radius="md">
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
                    <Button
                        component={Link}
                        to="/library/foods"
                        variant="subtle"
                        size="compact-sm"
                        rightSection={<IconChevronRight size={14} />}
                    >
                        Browse foods
                    </Button>
                </Paper>
                <Paper withBorder p="md" radius="md">
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
                    <Button
                        component={Link}
                        to="/library/recipes"
                        variant="subtle"
                        size="compact-sm"
                        rightSection={<IconChevronRight size={14} />}
                    >
                        Browse recipes
                    </Button>
                </Paper>
                <Paper withBorder p="md" radius="md">
                    <IconChartDots size={22} />
                    <Text fw={700} mt="sm">
                        Metric Center
                    </Text>
                    <Text size="sm" c="dimmed" mb="sm">
                        Units, definitions, and how TrackIt interprets metrics.
                    </Text>
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
        </div>
    )
}
