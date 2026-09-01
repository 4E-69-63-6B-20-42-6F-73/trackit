import type { GoalRecord } from './goalApi'
import { invalidateHealthQueries } from './healthQueries'
import type { Preferences } from './preferencesApi'
import { queryClient } from './queryClient'

export const serverQueryKeys = {
    preferences: ['server', 'preferences'] as const,
    goals: ['server', 'goals'] as const,
    journal: ['server', 'journal'] as const,
    meals: ['server', 'meals'] as const,
    foods: ['server', 'foods'] as const,
    recipes: ['server', 'recipes'] as const,
    foodCategories: ['server', 'food-categories'] as const,
    planItems: ['server', 'plan-items'] as const,
    planSchedules: ['server', 'plan-schedules'] as const,
    trendViews: ['server', 'trend-views'] as const,
    authStatus: ['server', 'auth-status'] as const,
}

export async function invalidateJournalQueries() {
    await queryClient.invalidateQueries({ queryKey: serverQueryKeys.journal })
}

export async function invalidateNutritionQueries() {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.meals }),
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.journal }),
        invalidateHealthQueries(),
    ])
}

export async function invalidateLibraryQueries() {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.foods }),
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.recipes }),
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.foodCategories }),
    ])
}

export async function invalidatePlanQueries() {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.planItems }),
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.planSchedules }),
    ])
}

let installed = false

export function installServerQueryInvalidation() {
    if (installed) return
    installed = true

    const observationsChanged = () => {
        void invalidateNutritionQueries()
    }
    const preferencesChanged = () => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.preferences })
    }
    const preferencesSaved = (event: Event) => {
        queryClient.setQueryData(
            serverQueryKeys.preferences,
            (event as CustomEvent<Preferences>).detail,
        )
        void invalidateHealthQueries()
    }
    const goalsChanged = () => {
        void Promise.all([
            queryClient.invalidateQueries({ queryKey: serverQueryKeys.goals }),
            invalidateHealthQueries(),
        ])
    }
    const goalSaved = (event: Event) => {
        const goal = (event as CustomEvent<GoalRecord>).detail
        queryClient.setQueryData<GoalRecord[]>(serverQueryKeys.goals, current => [
            goal,
            ...(current ?? []).filter(item => item.id !== goal.id),
        ])
        void invalidateHealthQueries()
    }
    const goalDeleted = (event: Event) => {
        const id = (event as CustomEvent<string>).detail
        queryClient.setQueryData<GoalRecord[]>(serverQueryKeys.goals, current =>
            (current ?? []).filter(item => item.id !== id),
        )
        void invalidateHealthQueries()
    }
    const planChanged = () => {
        void Promise.all([invalidatePlanQueries(), invalidateNutritionQueries()])
    }

    window.addEventListener('trackit:observations-changed', observationsChanged)
    window.addEventListener('trackit:preferences-changed', preferencesChanged)
    window.addEventListener('trackit:preferences-saved', preferencesSaved)
    window.addEventListener('trackit:goals-changed', goalsChanged)
    window.addEventListener('trackit:goal-saved', goalSaved)
    window.addEventListener('trackit:goal-deleted', goalDeleted as EventListener)
    window.addEventListener('trackit:plan-changed', planChanged)
}
