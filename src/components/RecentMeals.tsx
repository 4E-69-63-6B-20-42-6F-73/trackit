import { ActionIcon, Badge, Button, Group, Stack, Text, Tooltip } from '@mantine/core'
import { IconCopy, IconEdit, IconStar, IconStarFilled } from '@tabler/icons-react'
import type { MealRecord } from '../lib/nutritionApi'

export function RecentMeals({
    meals,
    onCopy,
    onFavorite,
    onEdit,
}: {
    meals: MealRecord[]
    onCopy: (meal: MealRecord) => void
    onFavorite: (meal: MealRecord) => void
    onEdit: (meal: MealRecord) => void
}) {
    if (!meals.length)
        return (
            <Text c="dimmed" size="sm">
                No meals have been logged yet. Log a food above and it will appear here for quick
                reuse.
            </Text>
        )
    return (
        <Stack gap="xs">
            {meals.slice(0, 5).map(meal => (
                <Group key={meal.id} justify="space-between" wrap="nowrap">
                    <div>
                        <Text size="sm" fw={600}>
                            {meal.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {meal.mealType} · {Math.round(meal.nutrientSnapshot.calories ?? 0)} kcal
                        </Text>
                        {meal.nutritionQuality !== 'complete' && (
                            <Badge
                                size="xs"
                                variant="light"
                                color={meal.nutritionQuality === 'estimated' ? 'orange' : 'gray'}
                            >
                                {meal.nutritionQuality}
                            </Badge>
                        )}
                    </div>
                    <Group gap="xs" wrap="nowrap">
                        <Tooltip label="Edit meal">
                            <ActionIcon
                                variant="subtle"
                                aria-label={`Edit ${meal.name}`}
                                onClick={() => onEdit(meal)}
                            >
                                <IconEdit size={17} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label={meal.favorite ? 'Remove favorite' : 'Add favorite'}>
                            <ActionIcon
                                variant="subtle"
                                aria-label={meal.favorite ? 'Remove favorite' : 'Add favorite'}
                                onClick={() => onFavorite(meal)}
                            >
                                {meal.favorite ? (
                                    <IconStarFilled size={17} />
                                ) : (
                                    <IconStar size={17} />
                                )}
                            </ActionIcon>
                        </Tooltip>
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<IconCopy size={15} />}
                            onClick={() => onCopy(meal)}
                        >
                            Log again
                        </Button>
                    </Group>
                </Group>
            ))}
        </Stack>
    )
}
