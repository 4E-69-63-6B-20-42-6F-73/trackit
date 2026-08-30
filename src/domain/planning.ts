export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
export type PlanStatus = 'planned' | 'skipped' | 'logged'

export type MealPlanItem = {
    id: string
    kind: 'meal'
    scheduledDate: string
    position: number
    skippedAt: string | null
    resultObservationId: string | null
    version: number
    meal: {
        mealType: MealType
        reference: {
            type: 'food' | 'recipe'
            id: string
            name: string
        }
        amount: number
        unit: 'g' | 'serving'
    }
}

export const planStatus = (item: MealPlanItem): PlanStatus =>
    item.resultObservationId ? 'logged' : item.skippedAt ? 'skipped' : 'planned'

export const weekStartKey = (dateKey: string) => {
    const date = new Date(`${dateKey}T12:00:00.000Z`)
    const mondayOffset = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - mondayOffset)
    return date.toISOString().slice(0, 10)
}

export const addPlanDays = (dateKey: string, days: number) => {
    const date = new Date(`${dateKey}T12:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

export const weekDateKeys = (dateKey: string) => {
    const start = weekStartKey(dateKey)
    return Array.from({ length: 7 }, (_, index) => addPlanDays(start, index))
}

export const formatPlanAmount = (item: MealPlanItem) =>
    item.meal.unit === 'g'
        ? `${Math.round(item.meal.amount * 10) / 10} g`
        : `${Math.round(item.meal.amount * 100) / 100} ${item.meal.amount === 1 ? 'serving' : 'servings'}`
