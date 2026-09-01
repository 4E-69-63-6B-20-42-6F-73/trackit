import { environment } from '../app/env'
import type { Food, Nutrients } from '../domain/nutrition'
import { authRequest } from './authApi'
import { sharedJsonRequest } from './sharedRequest'

type FoodRecord = {
    id: string
    name: string
    brand: string | null
    barcode: string | null
    catalogSource: string | null
    catalogId: string | null
    caloriesPer100g: number | null
    proteinPer100g: number | null
    carbsPer100g: number | null
    fatPer100g: number | null
    fiberPer100g: number | null
    sugarPer100g: number | null
    saturatedFatPer100g: number | null
    sodiumPer100g: number | null
    potassiumPer100g: number | null
    servingName: string
    servingGrams: number
    favorite: boolean
    nutritionQuality: 'complete' | 'estimated' | 'incomplete'
    version: number
}

export type MealRecord = {
    id: string
    name: string
    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
    eatenAt: string
    nutrientSnapshot: Partial<Nutrients>
    favorite: boolean
    version: number
    nutritionQuality: 'complete' | 'estimated' | 'incomplete'
    serving?: { amount: number; unit: 'g' | 'serving' }
}

export type RecipeRecord = {
    id: string
    name: string
    servings: number
    favorite: boolean
    version: number
    nutrientsPerServing: Nutrients
    nutritionQuality: 'complete' | 'estimated' | 'incomplete'
    items: { id: string; foodId: string; foodName: string; grams: number }[]
}

const toFood = (record: FoodRecord): Food => ({
    id: record.id,
    name: record.name,
    brand: record.brand ?? undefined,
    barcode: record.barcode ?? undefined,
    catalogSource: record.catalogSource ?? undefined,
    catalogId: record.catalogId ?? undefined,
    per100g: {
        calories: record.caloriesPer100g ?? undefined,
        protein: record.proteinPer100g ?? undefined,
        carbs: record.carbsPer100g ?? undefined,
        fat: record.fatPer100g ?? undefined,
        fiber: record.fiberPer100g ?? undefined,
        sugar: record.sugarPer100g ?? undefined,
        saturatedFat: record.saturatedFatPer100g ?? undefined,
        sodium: record.sodiumPer100g ?? undefined,
        potassium: record.potassiumPer100g ?? undefined,
    },
    servingName: record.servingName,
    servingGrams: record.servingGrams,
    favorite: record.favorite,
    nutritionQuality: record.nutritionQuality,
    version: record.version,
})

export async function searchFoods(query = '', signal?: AbortSignal) {
    const response = await fetch(
        `${environment.VITE_API_URL}/api/foods${query ? `?q=${encodeURIComponent(query)}` : ''}`,
        { credentials: 'same-origin', signal },
    )
    if (!response.ok) throw new Error('Food search unavailable')
    const body = (await response.json()) as { data: FoodRecord[] }
    return body.data.map(toFood)
}

export async function createFood(food: Omit<Food, 'id'>) {
    const response = await authRequest('/api/foods', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            name: food.name,
            brand: food.brand,
            barcode: food.barcode,
            catalogSource: food.catalogSource,
            catalogId: food.catalogId,
            servingName: food.servingName,
            servingGrams: food.servingGrams,
            favorite: food.favorite,
            nutritionQuality: food.nutritionQuality ?? 'complete',
            caloriesPer100g: food.per100g.calories,
            proteinPer100g: food.per100g.protein,
            carbsPer100g: food.per100g.carbs,
            fatPer100g: food.per100g.fat,
            fiberPer100g: food.per100g.fiber,
            sugarPer100g: food.per100g.sugar,
            saturatedFatPer100g: food.per100g.saturatedFat,
            sodiumPer100g: food.per100g.sodium,
            potassiumPer100g: food.per100g.potassium,
        }),
    })
    if (!response.ok) throw new Error('Could not create food')
    return toFood(((await response.json()) as { data: FoodRecord }).data)
}

export type FoodImportResult = {
    results: Array<{
        index: number
        status: 'created' | 'updated' | 'skipped' | 'failed'
        id?: string
        reason?: string
    }>
    created: number
    updated: number
    skipped: number
    failed: number
}

export async function importFoods(
    foods: Array<Omit<Food, 'id' | 'version'>>,
    duplicateStrategy: 'skip' | 'update' | 'create',
): Promise<FoodImportResult> {
    const response = await authRequest('/api/foods/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            duplicateStrategy,
            foods: foods.map(food => ({
                name: food.name,
                brand: food.brand,
                barcode: food.barcode,
                catalogSource: food.catalogSource,
                catalogId: food.catalogId,
                servingName: food.servingName,
                servingGrams: food.servingGrams,
                favorite: food.favorite,
                nutritionQuality: food.nutritionQuality ?? 'complete',
                caloriesPer100g: food.per100g.calories,
                proteinPer100g: food.per100g.protein,
                carbsPer100g: food.per100g.carbs,
                fatPer100g: food.per100g.fat,
                fiberPer100g: food.per100g.fiber,
                sugarPer100g: food.per100g.sugar,
                saturatedFatPer100g: food.per100g.saturatedFat,
                sodiumPer100g: food.per100g.sodium,
                potassiumPer100g: food.per100g.potassium,
            })),
        }),
    })
    if (!response.ok) throw new Error('The server could not import this catalog.')
    return ((await response.json()) as { data: FoodImportResult }).data
}

type CatalogFoodRecord = Omit<FoodRecord, 'id' | 'favorite' | 'version'>

const catalogToFood = (record: CatalogFoodRecord): Omit<Food, 'id' | 'version'> => ({
    name: record.name,
    brand: record.brand ?? undefined,
    barcode: record.barcode ?? undefined,
    catalogSource: record.catalogSource ?? undefined,
    catalogId: record.catalogId ?? undefined,
    per100g: {
        calories: record.caloriesPer100g ?? undefined,
        protein: record.proteinPer100g ?? undefined,
        carbs: record.carbsPer100g ?? undefined,
        fat: record.fatPer100g ?? undefined,
        fiber: record.fiberPer100g ?? undefined,
        sugar: record.sugarPer100g ?? undefined,
        saturatedFat: record.saturatedFatPer100g ?? undefined,
        sodium: record.sodiumPer100g ?? undefined,
        potassium: record.potassiumPer100g ?? undefined,
    },
    servingName: record.servingName,
    servingGrams: record.servingGrams,
    favorite: false,
    nutritionQuality: record.nutritionQuality,
})

export async function lookupCatalogBarcode(barcode: string, signal?: AbortSignal) {
    const response = await authRequest(`/api/food-catalog/barcode/${encodeURIComponent(barcode)}`, {
        signal,
    })
    if (response.status === 404) return null
    if (response.status === 503)
        throw new Error('No external food catalog is configured on this server.')
    if (!response.ok) throw new Error('The food catalog is unavailable. Try again later.')
    return catalogToFood(((await response.json()) as { data: CatalogFoodRecord }).data)
}

export async function searchFoodCatalog(query: string, signal?: AbortSignal) {
    const response = await authRequest(`/api/food-catalog/search?q=${encodeURIComponent(query)}`, {
        signal,
    })
    if (response.status === 503)
        throw new Error('No external food catalog is configured on this server.')
    if (!response.ok) throw new Error('The food catalog is unavailable. Try again later.')
    return ((await response.json()) as { data: CatalogFoodRecord[] }).data.map(catalogToFood)
}

export async function updateFood(food: Food, changes: Omit<Food, 'id' | 'version'>) {
    if (!food.version) throw new Error('This food is not stored on the server.')
    const response = await authRequest(`/api/foods/${food.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            version: food.version,
            name: changes.name,
            brand: changes.brand,
            barcode: changes.barcode,
            catalogSource: changes.catalogSource,
            catalogId: changes.catalogId,
            servingName: changes.servingName,
            servingGrams: changes.servingGrams,
            favorite: changes.favorite,
            nutritionQuality: changes.nutritionQuality ?? 'complete',
            caloriesPer100g: changes.per100g.calories,
            proteinPer100g: changes.per100g.protein,
            carbsPer100g: changes.per100g.carbs,
            fatPer100g: changes.per100g.fat,
            fiberPer100g: changes.per100g.fiber,
            sugarPer100g: changes.per100g.sugar,
            saturatedFatPer100g: changes.per100g.saturatedFat,
            sodiumPer100g: changes.per100g.sodium,
            potassiumPer100g: changes.per100g.potassium,
        }),
    })
    if (response.status === 409) throw new Error('Food changed elsewhere. Reload and try again.')
    if (!response.ok) throw new Error('Could not update food')
    return toFood(((await response.json()) as { data: FoodRecord }).data)
}

export async function deleteFood(food: Food) {
    if (!food.version) throw new Error('This food is not stored on the server.')
    const response = await authRequest(`/api/foods/${food.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: food.version }),
    })
    if (response.status === 409) {
        const body = (await response.json()) as {
            error?: string
            recipes?: Array<{ id: string; name: string }>
            plannedMeals?: number
        }
        if (body.error === 'food_in_use') {
            const names = body.recipes?.map(recipe => recipe.name).filter(Boolean) ?? []
            const planCount = body.plannedMeals ?? 0
            if (names.length && planCount)
                throw new Error(
                    `This food is used by ${names.join(', ')} and ${planCount} planned ${planCount === 1 ? 'meal' : 'meals'}. Remove those references before deleting it.`,
                )
            if (names.length)
                throw new Error(
                    `This food is used by ${names.join(', ')}. Remove it from those recipes before deleting it.`,
                )
            if (planCount)
                throw new Error(
                    `This food is used by ${planCount} planned ${planCount === 1 ? 'meal' : 'meals'}. Remove it from your plan before deleting it.`,
                )
            throw new Error('This food is still in use. Remove its references before deleting it.')
        }
        throw new Error('Food changed elsewhere. Reload and try again.')
    }
    if (response.status === 404) throw new Error('This food no longer exists.')
    if (!response.ok) throw new Error('Could not delete food')
}

export async function logMeal(
    name: string,
    mealType: string,
    nutrients: Partial<Nutrients>,
    nutritionQuality: 'complete' | 'estimated' | 'incomplete' = 'complete',
    foodId?: string,
    eatenAt = new Date().toISOString(),
    serving?: { amount: number; unit: 'g' | 'serving' },
) {
    const response = await authRequest('/api/meals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            id: crypto.randomUUID(),
            name,
            mealType,
            eatenAt,
            nutrients,
            nutritionQuality,
            favorite: false,
            foodId,
            serving,
        }),
    })
    if (!response.ok) throw new Error('Could not log meal')
}

export async function updateMeal(
    id: string,
    version: number,
    changes: Partial<{
        name: string
        mealType: MealRecord['mealType']
        eatenAt: string
        nutrients: Record<string, number>
        favorite: boolean
        nutritionQuality: 'complete' | 'estimated' | 'incomplete'
        serving: { amount: number; unit: 'g' | 'serving' } | null
    }>,
) {
    const response = await authRequest(`/api/meals/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version, ...changes }),
    })
    if (!response.ok) throw new Error('Could not update meal')
    return ((await response.json()) as { data: MealRecord }).data
}

export async function deleteMeal(id: string): Promise<void> {
    const response = await authRequest(`/api/meals/${id}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404)
        throw new Error(`Meal delete failed (${response.status})`)
}

export async function listRecipes(signal?: AbortSignal): Promise<RecipeRecord[]> {
    const response = await fetch(`${environment.VITE_API_URL}/api/recipes`, {
        credentials: 'same-origin',
        signal,
    })
    if (!response.ok) throw new Error('Recipes unavailable')
    return ((await response.json()) as { data: RecipeRecord[] }).data
}

export async function createRecipe(input: {
    name: string
    servings: number
    favorite: boolean
    items: { foodId: string; grams: number }[]
}) {
    const response = await authRequest('/api/recipes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Could not create recipe')
    return ((await response.json()) as { data: RecipeRecord }).data
}

export async function updateRecipeYield(recipe: RecipeRecord, servings: number) {
    const response = await authRequest(`/api/recipes/${recipe.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ servings, version: recipe.version }),
    })
    if (response.status === 409) throw new Error('Recipe changed elsewhere. Reload and try again.')
    if (!response.ok) throw new Error('Could not update recipe yield')
}

export async function listMeals(range: { from?: string; to?: string } = {}, signal?: AbortSignal) {
    const query = new URLSearchParams(
        Object.entries(range).filter((entry): entry is [string, string] => Boolean(entry[1])),
    )
    return (
        await sharedJsonRequest<{ data: MealRecord[] }>(
            `${environment.VITE_API_URL}/api/meals?${query}`,
            signal,
        )
    ).data
}
