import { useEffect, useState } from 'react'
import { Badge, Button, Divider, Group, Progress, SimpleGrid, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { calendarDateKey } from '../domain/calendar'
import { formatPlanAmount, planStatus, type MealPlanItem } from '../domain/planning'
import { useDailyNutrition } from '../hooks/useDailyNutrition'
import { useServerData } from '../hooks/useServerData'
import { listPlanItems } from '../lib/planApi'
import { NutritionSkeleton } from './LoadingSkeletons'

export function DailyNutritionPanel({
    openGoals,
    selectedDate,
}: {
    openGoals?: () => void
    selectedDate: Date
}) {
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const dateKey = calendarDateKey(selectedDate, timezone)
    const [plannedMeals, setPlannedMeals] = useState<MealPlanItem[]>([])
    const {
        nutrients,
        mealCount,
        loading,
        unavailable,
        proteinGoal,
        hasProteinGoal,
        nutritionQuality,
    } = useDailyNutrition(selectedDate)

    useEffect(() => {
        let active = true
        const refresh = () =>
            void listPlanItems({ from: dateKey, to: dateKey })
                .then(items => active && setPlannedMeals(items))
                .catch(() => active && setPlannedMeals([]))
        refresh()
        window.addEventListener('trackit:plan-changed', refresh)
        return () => {
            active = false
            window.removeEventListener('trackit:plan-changed', refresh)
        }
    }, [dateKey])

    if (loading) return <NutritionSkeleton />

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <div>
                    <Text fw={650}>Meal plan</Text>
                    <Text size="xs" c="dimmed">
                        Intentions for this day. They count only after they are logged.
                    </Text>
                </div>
                <Button
                    component={Link}
                    to={`/plan?date=${dateKey}`}
                    variant="subtle"
                    color="trackit"
                    size="compact-sm"
                >
                    Open plan
                </Button>
            </Group>
            {plannedMeals.length ? (
                <Stack gap={6}>
                    {plannedMeals.map(item => {
                        const status = planStatus(item)
                        return (
                            <Group key={item.id} justify="space-between" gap="sm" wrap="nowrap">
                                <div>
                                    <Text size="sm" fw={650}>
                                        {item.meal.mealType} · {item.meal.reference.name}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {formatPlanAmount(item)}
                                    </Text>
                                </div>
                                <Badge
                                    size="xs"
                                    variant="light"
                                    color={
                                        status === 'logged'
                                            ? 'teal'
                                            : status === 'skipped'
                                              ? 'gray'
                                              : 'blue'
                                    }
                                >
                                    {status === 'logged'
                                        ? 'Logged'
                                        : status === 'skipped'
                                          ? 'Skipped'
                                          : 'Planned'}
                                </Badge>
                            </Group>
                        )
                    })}
                </Stack>
            ) : (
                <Text size="sm" c="dimmed">
                    No meals planned for this day.
                </Text>
            )}

            <Divider />

            <Group justify="space-between" align="flex-start">
                <div>
                    <Text size="xs" c="dimmed">
                        Energy
                    </Text>
                    <Text fw={700} size="xl">
                        {Math.round(nutrients.calories)} kcal
                    </Text>
                </div>
                <Group gap="xs" justify="flex-end">
                    <Text size="sm" c="dimmed">
                        {unavailable
                            ? 'Totals unavailable'
                            : `${mealCount} ${mealCount === 1 ? 'meal' : 'meals'} logged`}
                    </Text>
                    {!unavailable && nutritionQuality !== 'complete' && (
                        <Badge
                            size="xs"
                            variant="light"
                            color={nutritionQuality === 'estimated' ? 'orange' : 'gray'}
                        >
                            {nutritionQuality}
                        </Badge>
                    )}
                </Group>
            </Group>

            {unavailable ? (
                <Text size="sm" c="dimmed">
                    Calories, macros, and meal count will appear after TrackIt reconnects.
                </Text>
            ) : (
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                    <div>
                        <Text size="xs" c="dimmed">
                            Protein
                        </Text>
                        <Text fw={650}>{Math.round(nutrients.protein)} g</Text>
                    </div>
                    <div>
                        <Text size="xs" c="dimmed">
                            Carbs
                        </Text>
                        <Text fw={650}>{Math.round(nutrients.carbs)} g</Text>
                    </div>
                    <div>
                        <Text size="xs" c="dimmed">
                            Fat
                        </Text>
                        <Text fw={650}>{Math.round(nutrients.fat)} g</Text>
                    </div>
                    <div>
                        <Text size="xs" c="dimmed">
                            Fiber
                        </Text>
                        <Text fw={650}>{Math.round(nutrients.fiber)} g</Text>
                    </div>
                </SimpleGrid>
            )}

            {!unavailable &&
                (proteinGoal ? (
                    <Stack gap={6}>
                        <Group justify="space-between" gap="sm">
                            <Text size="xs" c="dimmed">
                                Protein goal
                            </Text>
                            <Text size="xs" fw={650}>
                                {Math.round(nutrients.protein)} / {Math.round(proteinGoal)} g
                            </Text>
                        </Group>
                        <Progress
                            value={Math.min((nutrients.protein / proteinGoal) * 100, 100)}
                            color="orange"
                            radius="xl"
                            size="sm"
                            aria-label="Daily protein progress"
                        />
                    </Stack>
                ) : hasProteinGoal ? (
                    <Button
                        variant="subtle"
                        color="trackit"
                        size="compact-sm"
                        onClick={openGoals}
                        disabled={!openGoals}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        View protein goal
                    </Button>
                ) : (
                    <Button
                        variant="subtle"
                        color="trackit"
                        size="compact-sm"
                        onClick={openGoals}
                        disabled={!openGoals}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Set a protein goal
                    </Button>
                ))}
        </Stack>
    )
}
