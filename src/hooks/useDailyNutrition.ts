import { useEffect, useState } from 'react'
import { emptyNutrients, type Nutrients } from '../domain/nutrition'
import { listMeals } from '../lib/nutritionApi'
import { listGoals } from '../lib/goalApi'
import { getPreferences } from '../lib/preferencesApi'

export type DailyNutritionState = {
    nutrients: Nutrients
    mealCount: number
    loading: boolean
    unavailable: boolean
    proteinGoal: number | null
    nutritionQuality: 'complete' | 'estimated' | 'incomplete'
}

export function useDailyNutrition(): DailyNutritionState {
    const [state, setState] = useState<DailyNutritionState>({
        nutrients: emptyNutrients(),
        mealCount: 0,
        loading: true,
        unavailable: false,
        proteinGoal: null,
        nutritionQuality: 'complete',
    })

    useEffect(() => {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)
        end.setMilliseconds(-1)
        const queryStart = new Date(start)
        queryStart.setDate(queryStart.getDate() - 1)
        const queryEnd = new Date(end)
        queryEnd.setDate(queryEnd.getDate() + 1)
        void Promise.all([
            listMeals({ from: queryStart.toISOString(), to: queryEnd.toISOString() }),
            listGoals().catch(() => []),
            getPreferences().catch(() => null),
        ])
            .then(([meals, goals, preferences]) => {
                const now = new Date()
                const timezone =
                    preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
                const dayFormatter = new Intl.DateTimeFormat('en-CA', {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                })
                const today = dayFormatter.format(now)
                const todaysMeals = meals.filter(
                    meal => dayFormatter.format(new Date(meal.eatenAt)) === today,
                )
                const nutrients = todaysMeals.reduce((total, meal) => {
                    for (const key of Object.keys(total) as (keyof Nutrients)[]) {
                        total[key] += meal.nutrientSnapshot[key] ?? 0
                    }
                    return total
                }, emptyNutrients())
                setState({
                    nutrients,
                    mealCount: todaysMeals.length,
                    loading: false,
                    unavailable: false,
                    proteinGoal:
                        goals.find(goal => {
                            const weekday = new Intl.DateTimeFormat('en-US', {
                                timeZone: timezone,
                                weekday: 'short',
                            }).format(now)
                            const weekdayNumber = [
                                'Sun',
                                'Mon',
                                'Tue',
                                'Wed',
                                'Thu',
                                'Fri',
                                'Sat',
                            ].indexOf(weekday)
                            return (
                                goal.metric === 'protein' &&
                                new Date(goal.effectiveFrom) <= now &&
                                (!goal.effectiveTo || new Date(goal.effectiveTo) >= now) &&
                                (!goal.schedule.weekdays?.length ||
                                    goal.schedule.weekdays.includes(weekdayNumber))
                            )
                        })?.targetValue ?? null,
                    nutritionQuality: todaysMeals.some(
                        meal => meal.nutritionQuality === 'incomplete',
                    )
                        ? 'incomplete'
                        : todaysMeals.some(meal => meal.nutritionQuality === 'estimated')
                          ? 'estimated'
                          : 'complete',
                })
            })
            .catch(() =>
                setState({
                    nutrients: emptyNutrients(),
                    mealCount: 0,
                    loading: false,
                    unavailable: true,
                    proteinGoal: null,
                    nutritionQuality: 'complete',
                }),
            )
    }, [])

    return state
}
