import type { JournalEvent } from '../domain/types'
import type { MealRecord } from '../lib/nutritionApi'
import { FoodLogger } from './logging/FoodLogger'
import { toast } from './toast'

type MealEvent = JournalEvent & {
    detailView: Extract<NonNullable<JournalEvent['detailView']>, { kind: 'meal' }>
}

export function JournalMealEditModal({
    event,
    onClose,
    onSaved,
}: {
    event: JournalEvent | null
    onClose: () => void
    onSaved: () => void
}) {
    const mealEvent = event?.detailView?.kind === 'meal' ? (event as MealEvent) : null
    if (!mealEvent) return null

    const meal: MealRecord = {
        id: mealEvent.id,
        name: mealEvent.title,
        mealType: mealEvent.detailView.mealType,
        eatenAt: mealEvent.observedAt,
        nutrientSnapshot: mealEvent.detailView.nutrients,
        favorite: false,
        version: mealEvent.version ?? 1,
        nutritionQuality: mealEvent.detailView.nutritionQuality,
        serving: mealEvent.detailView.serving,
        sourceItem: mealEvent.detailView.sourceItem,
    }

    return (
        <FoodLogger
            key={`${meal.id}:${meal.version}`}
            opened
            close={onClose}
            editMeal={meal}
            onSaved={onSaved}
            onFeedback={toast.success}
        />
    )
}
