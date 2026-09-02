import { nutrientsFor, roundedNutrients, type Food, type Nutrients } from '@trackit/domain/nutrition'
import type { MealRecord, RecipeRecord } from '../../lib/nutritionApi'

export type FoodLoggerSelection =
    | { kind: 'food'; food: Food }
    | { kind: 'recipe'; recipe: RecipeRecord }
    | { kind: 'snapshot'; meal: MealRecord }

export type CatalogFood = Omit<Food, 'id' | 'version'>

export const selectionKey = (selection: FoodLoggerSelection) =>
    selection.kind === 'food'
        ? `food:${selection.food.id}`
        : selection.kind === 'recipe'
          ? `recipe:${selection.recipe.id}`
          : `snapshot:${selection.meal.id}`

export const selectionName = (selection: FoodLoggerSelection) =>
    selection.kind === 'food'
        ? selection.food.name
        : selection.kind === 'recipe'
          ? selection.recipe.name
          : selection.meal.name

export const selectionFavorite = (selection: FoodLoggerSelection) =>
    selection.kind === 'food'
        ? selection.food.favorite
        : selection.kind === 'recipe'
          ? selection.recipe.favorite
          : false

export const selectionDefaultAmount = (selection: FoodLoggerSelection) =>
    selection.kind === 'food'
        ? selection.food.servingGrams
        : selection.kind === 'recipe'
          ? 1
          : (selection.meal.serving?.amount ?? 1)

export const selectionQuality = (selection: FoodLoggerSelection) =>
    selection.kind === 'food'
        ? selection.food.nutritionQuality
        : selection.kind === 'recipe'
          ? selection.recipe.nutritionQuality
          : selection.meal.nutritionQuality

export const selectionNutrients = (selection: FoodLoggerSelection, amount: number) => {
    if (selection.kind === 'food') return roundedNutrients(nutrientsFor(selection.food, amount))
    if (selection.kind === 'recipe')
        return roundedNutrients(
            Object.fromEntries(
                Object.entries(selection.recipe.nutrientsPerServing).map(([key, value]) => [
                    key,
                    value * amount,
                ]),
            ) as Nutrients,
        )
    const factor = amount / (selection.meal.serving?.amount ?? 1)
    return roundedNutrients(
        Object.fromEntries(
            Object.entries(selection.meal.nutrientSnapshot)
                .filter(
                    (entry): entry is [string, number] =>
                        typeof entry[1] === 'number' && Number.isFinite(entry[1]),
                )
                .map(([key, value]) => [key, value * factor]),
        ) as Partial<Nutrients>,
    )
}

export const catalogNutrients = (food: CatalogFood, amount: number): Partial<Nutrients> => {
    const factor = amount / 100
    return Object.fromEntries(
        Object.entries(food.per100g)
            .filter(
                (entry): entry is [string, number] =>
                    typeof entry[1] === 'number' && Number.isFinite(entry[1]),
            )
            .map(([key, value]) => [key, value * factor]),
    ) as Partial<Nutrients>
}

export const foodUpdatePayload = (food: Food): Omit<Food, 'id' | 'version'> => {
    const payload = { ...food }
    delete (payload as Partial<Food>).id
    delete (payload as Partial<Food>).version
    return payload as Omit<Food, 'id' | 'version'>
}

export const resultSummary = (selection: FoodLoggerSelection) => {
    const nutrients = selectionNutrients(selection, selectionDefaultAmount(selection))
    return {
        calories: Math.round(nutrients.calories ?? 0),
        protein: Math.round((nutrients.protein ?? 0) * 10) / 10,
    }
}

export const selectionMeta = (selection: FoodLoggerSelection) =>
    selection.kind === 'food'
        ? selection.food.brand || `${selection.food.servingGrams} g serving`
        : selection.kind === 'recipe'
          ? 'Recipe · per serving'
          : selection.meal.serving
            ? `Current entry · ${selection.meal.serving.amount} ${selection.meal.serving.unit === 'g' ? 'g' : selection.meal.serving.amount === 1 ? 'serving' : 'servings'}`
            : 'Current journal entry'

export const defaultServingLabel = (food: Food) => {
    const label = food.servingName.trim()
    return /^[\d¼½¾]/.test(label) ? label : `1 ${label}`
}

export const selectionServing = (selection: FoodLoggerSelection, amount: number) => {
    if (selection.kind === 'snapshot' && selection.meal.serving)
        return { amount, unit: selection.meal.serving.unit }
    return { amount, unit: selection.kind === 'food' ? ('g' as const) : ('serving' as const) }
}

export const selectionSource = (selection: FoodLoggerSelection) => ({
    foodId:
        selection.kind === 'food'
            ? selection.food.id
            : selection.kind === 'recipe'
              ? null
              : undefined,
    recipeId:
        selection.kind === 'recipe'
            ? selection.recipe.id
            : selection.kind === 'food'
              ? null
              : undefined,
})

export const quickAmounts = (selection: FoodLoggerSelection) => {
    if (selection.kind === 'food')
        return [
            { label: '100 g', value: 100 },
            { label: defaultServingLabel(selection.food), value: selection.food.servingGrams },
            ...(selection.food.servingOptions ?? []).map(option => ({
                label: option.label,
                value: option.grams,
            })),
        ]
    if (selection.kind === 'recipe' || selection.meal.serving?.unit !== 'g')
        return [
            { label: '½ serving', value: 0.5 },
            { label: '1 serving', value: 1 },
            { label: '2 servings', value: 2 },
        ]
    return [{ label: 'Original', value: selectionDefaultAmount(selection) }]
}
