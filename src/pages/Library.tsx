import { Alert, Group, Paper, SimpleGrid, Skeleton, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { IconApple, IconChartDots, IconChefHat, IconChevronRight } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { listRecipes, searchFoods } from '../lib/nutritionApi'
import { serverQueryKeys } from '../lib/serverQueries'

export function Library() {
    const foodsQuery = useQuery({
        queryKey: [...serverQueryKeys.foods, ''],
        queryFn: () => searchFoods(''),
    })
    const recipesQuery = useQuery({
        queryKey: serverQueryKeys.recipes,
        queryFn: () => listRecipes(),
    })
    const loading = foodsQuery.isPending || recipesQuery.isPending
    const unavailable = foodsQuery.isError || recipesQuery.isError
    const foodCount = foodsQuery.data?.length ?? 0
    const recipeCount = recipesQuery.data?.length ?? 0

    return (
        <div className="page-content simple-page">
            <PageHeader
                title="Library"
                description="Reusable reference data for logging, recipes, and metric behavior."
            />
            {unavailable && (
                <Alert mt="md" color="orange">
                    Your library could not be loaded from the server.
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
                        {loading ? (
                            <Skeleton height={14} width={24} aria-label="Loading food count" />
                        ) : (
                            <Text size="xs" c="dimmed">
                                {foodCount}
                            </Text>
                        )}
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
                        {loading ? (
                            <Skeleton height={14} width={24} aria-label="Loading recipe count" />
                        ) : (
                            <Text size="xs" c="dimmed">
                                {recipeCount}
                            </Text>
                        )}
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
