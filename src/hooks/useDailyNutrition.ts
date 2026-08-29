import { useEffect, useState } from 'react'
import { calendarDateKey, calendarDayRangeForKey } from '../domain/calendar'
import { emptyNutrients, type Nutrients } from '../domain/nutrition'
import { listMeals } from '../lib/nutritionApi'
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
    const [state, setState] = useState<DailyNutritionState>({
        nutrients: emptyNutrients(),
        mealCount: 0,
        loading: true,
        unavailable: false,
        proteinGoal: null,
        hasProteinGoal: false,
        nutritionQuality: 'complete',
    })
    const timezone = preferences?.timezone ?? 'UTC'
    const selectedKey = calendarDateKey(selectedDate, timezone)

    useEffect(() => {
        const controller = new AbortController()
        const day = calendarDayRangeForKey(selectedKey, timezone)
        void listMeals(
            { from: day.from.toISOString(), to: day.to.toISOString() },
            controller.signal,
        )
            .then(meals => {
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
                        (!goal.schedule.weekdays?.length ||
                            goal.schedule.weekdays.includes(weekday))
                    )
                })
                const cumulativeProteinTarget =
                    proteinGoal?.aggregation === 'total' &&
                    proteinGoal.period.type === 'day' &&
                    proteinGoal.comparator === 'gte' &&
                    'value' in proteinGoal.target
                        ? proteinGoal.target.value
                        : null
                setState({
                    nutrients,
                    mealCount: meals.length,
                    loading: false,
                    unavailable: false,
                    proteinGoal: cumulativeProteinTarget,
                    hasProteinGoal: Boolean(proteinGoal),
                    nutritionQuality: meals.some(meal => meal.nutritionQuality === 'incomplete')
                        ? 'incomplete'
                        : meals.some(meal => meal.nutritionQuality === 'estimated')
                          ? 'estimated'
                          : 'complete',
                })
            })
            .catch(error => {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setState({
                    nutrients: emptyNutrients(),
                    mealCount: 0,
                    loading: false,
                    unavailable: true,
                    proteinGoal: null,
                    hasProteinGoal: false,
                    nutritionQuality: 'complete',
                })
            })
        return () => controller.abort()
    }, [goals, selectedKey, timezone])

    return state
}
