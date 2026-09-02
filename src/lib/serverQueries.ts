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
    devices: ['server', 'devices'] as const,
    mcpStatus: ['server', 'mcp-status'] as const,
    mcpAccessEvents: ['server', 'mcp-access-events'] as const,
    securitySessions: ['server', 'security-sessions'] as const,
    securityAudit: ['server', 'security-audit'] as const,
}

export async function invalidateJournalQueries() {
    await queryClient.invalidateQueries({ queryKey: serverQueryKeys.journal })
}

export async function invalidateObservationQueries() {
    await Promise.all([invalidateJournalQueries(), invalidateHealthQueries()])
}

export async function invalidateNutritionQueries() {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: serverQueryKeys.meals }),
        invalidateJournalQueries(),
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

export async function invalidatePlanAndNutritionQueries() {
    await Promise.all([invalidatePlanQueries(), invalidateNutritionQueries()])
}

export async function cachePreferences(preferences: Preferences) {
    queryClient.setQueryData(serverQueryKeys.preferences, preferences)
    await invalidateHealthQueries()
}

export async function cacheGoal(goal: GoalRecord) {
    queryClient.setQueryData<GoalRecord[]>(serverQueryKeys.goals, current => [
        goal,
        ...(current ?? []).filter(item => item.id !== goal.id),
    ])
    await invalidateHealthQueries()
}

export async function removeGoalFromCache(id: string) {
    queryClient.setQueryData<GoalRecord[]>(serverQueryKeys.goals, current =>
        (current ?? []).filter(item => item.id !== id),
    )
    await invalidateHealthQueries()
}

export async function invalidateAllServerDataQueries() {
    await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['server'] }),
        invalidateHealthQueries(),
    ])
}
