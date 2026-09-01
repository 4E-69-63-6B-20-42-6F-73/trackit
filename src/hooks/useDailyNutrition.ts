import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { calendarDateKey, calendarDayRangeForKey } from '../domain/calendar'
import { emptyNutrients, type Nutrients } from '../domain/nutrition'
import { listMeals } from '../lib/nutritionApi'
import { serverQueryKeys } from '../lib/serverQueries'
import { useServerData } from './useServerData'

export type DailyNutritionState = {
    nutrients: Nutrients
    mealCount: number
    loading: boolean
    unavailable: boolean
    proteinGoal: number | null
    hasProteinGoal: boolean
    nutritionQuality: 'complete' | 'estimated' | 'incomplete'
}

export function useDailyNutrition(selectedDate: Date): DailyNutritionState {
    const { goals, preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const selectedKey = calendarDateKey(selectedDate, timezone)
    const day = calendarDayRangeForKey(selectedKey, timezone)
    const range = { from: day.from.toISOString(), to: day.to.toISOString() }
    const mealsQuery = useQuery({
        queryKey: [...serverQueryKeys.meals, range],
        queryFn: ({ signal }) => listMeals(range, signal),
    })

    return useMemo(() => {
        const meals = mealsQuery.data ?? []
        const nutrients = meals.reduce((total, meal) => {
            for (const key of Object.keys(total) as (keyof Nutrients)[]) {
                total[key] += meal.nutrientSnapshot[key] ?? 0
            }
            return total
        }, emptyNutrients())
        const weekday = new Date(`${selectedKey}T12:00:00.000Z`).getUTCDay()
        const proteinGoal = goals.find(goal => {
            const effectiveFrom = calendarDateKey(new Date(goal.effectiveFrom), timezone)
            const effectiveTo = goal.effectiveTo
                ? calendarDateKey(new Date(goal.effectiveTo), timezone)
                : null
            return (
                goal.metricId === 'protein' &&
                effectiveFrom <= selectedKey &&
                (!effectiveTo || effectiveTo >= selectedKey) &&
                (!goal.schedule.weekdays?.length || goal.schedule.weekdays.includes(weekday))
            )
        })
        const cumulativeProteinTarget =
            proteinGoal?.aggregation === 'total' &&
            proteinGoal.period.type === 'day' &&
            proteinGoal.comparator === 'gte' &&
            'value' in proteinGoal.target
                ? proteinGoal.target.value
                : null

        return {
            nutrients,
            mealCount: meals.length,
            loading: mealsQuery.isPending,
            unavailable: mealsQuery.isError,
            proteinGoal: cumulativeProteinTarget,
            hasProteinGoal: Boolean(proteinGoal),
            nutritionQuality: meals.some(meal => meal.nutritionQuality === 'incomplete')
                ? 'incomplete'
                : meals.some(meal => meal.nutritionQuality === 'estimated')
                  ? 'estimated'
                  : 'complete',
        }
    }, [goals, mealsQuery.data, mealsQuery.isError, mealsQuery.isPending, selectedKey, timezone])
}
