import { useEffect, useState } from 'react'
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

    useEffect(() => {
        const controller = new AbortController()
        const start = new Date(selectedDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)
        void listMeals({ from: start.toISOString(), to: end.toISOString() }, controller.signal)
            .then(meals => {
                const nutrients = meals.reduce((total, meal) => {
                    for (const key of Object.keys(total) as (keyof Nutrients)[]) {
                        total[key] += meal.nutrientSnapshot[key] ?? 0
                    }
                    return total
                }, emptyNutrients())
                const weekday = selectedDate.getDay()
                const proteinGoal = goals.find(
                    goal =>
                        goal.metricId === 'protein' &&
                        new Date(goal.effectiveFrom) <= selectedDate &&
                        (!goal.effectiveTo || new Date(goal.effectiveTo) >= selectedDate) &&
                        (!goal.schedule.weekdays?.length ||
                            goal.schedule.weekdays.includes(weekday)),
                )
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
    }, [goals, preferences?.timezone, selectedDate])

    return state
}
