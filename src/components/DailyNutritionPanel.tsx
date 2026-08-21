import { Badge, Progress, Skeleton, Text } from '@mantine/core'
import { IconApple } from '@tabler/icons-react'
import { useDailyNutrition } from '../hooks/useDailyNutrition'

export function DailyNutritionPanel() {
    const { nutrients, mealCount, loading, unavailable, proteinGoal, nutritionQuality } =
        useDailyNutrition()

    if (loading)
        return (
            <Skeleton role="status" aria-label="Loading daily nutrition" height={64} radius="md" />
        )

    return (
        <div className="progress-row">
            <div className="progress-label">
                <span>
                    <IconApple size={18} />
                    Nutrition
                </span>
                <strong>
                    {Math.round(nutrients.calories)} kcal
                    <small>
                        {unavailable
                            ? 'totals unavailable'
                            : `${mealCount} ${mealCount === 1 ? 'meal' : 'meals'} logged`}
                    </small>
                </strong>
            </div>
            {!unavailable && (
                <Text className="nutrition-macros" size="xs" c="dimmed">
                    {Math.round(nutrients.protein)} g protein · {Math.round(nutrients.carbs)} g
                    carbs · {Math.round(nutrients.fat)} g fat · {Math.round(nutrients.fiber)} g
                    fiber
                </Text>
            )}
            {proteinGoal ? (
                <Progress
                    value={Math.min((nutrients.protein / proteinGoal) * 100, 100)}
                    color="orange"
                    radius="xl"
                    size="sm"
                    aria-label="Daily protein progress"
                />
            ) : (
                <Text size="xs" c="dimmed">
                    No protein goal set; totals remain fully available.
                </Text>
            )}
            {nutritionQuality !== 'complete' && (
                <Badge
                    size="xs"
                    variant="light"
                    color={nutritionQuality === 'estimated' ? 'orange' : 'gray'}
                >
                    {nutritionQuality} nutrition
                </Badge>
            )}
            {unavailable && (
                <Text size="xs" c="dimmed" mt={4}>
                    Today’s calories, protein, and meal count will appear after TrackIt reconnects.
                </Text>
            )}
        </div>
    )
}
