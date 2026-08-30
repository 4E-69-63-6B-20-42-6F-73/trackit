export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
export type PlanStatus = 'planned' | 'partial' | 'skipped' | 'logged'
export type PlanReferenceType = 'food' | 'recipe' | 'category'

export type MealPlanItem = {
    id: string
    kind: 'meal'
    scheduledDate: string
    scheduledTime: string | null
    position: number
    skippedAt: string | null
    resultObservationId: string | null
    version: number
    meal: {
        mealType: MealType
        reference: {
            type: PlanReferenceType
            id: string
            name: string
        }
        amount: number
        unit: 'g' | 'serving'
        fulfilledAmount: number
    }
}

export const planStatus = (item: MealPlanItem): PlanStatus => {
    if (item.resultObservationId) return 'logged'
    if (
        item.meal.reference.type === 'category' &&
        item.meal.fulfilledAmount >= item.meal.amount
    )
        return 'logged'
    if (item.skippedAt) return 'skipped'
    if (item.meal.fulfilledAmount > 0) return 'partial'
    return 'planned'
}

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

export const formatPlanProgress = (item: MealPlanItem) =>
    `${Math.round(item.meal.fulfilledAmount * 10) / 10} / ${Math.round(item.meal.amount * 10) / 10} g`
