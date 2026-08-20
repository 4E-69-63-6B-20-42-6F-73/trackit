import { environment } from '../app/env'
import type { Food, Nutrients } from '../domain/nutrition'
import { authRequest } from './authApi'

type FoodRecord = {
    id: string
    name: string
    brand: string | null
    caloriesPer100g: number
    proteinPer100g: number
    carbsPer100g: number
    fatPer100g: number
    fiberPer100g: number
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
    per100g: {
        calories: record.caloriesPer100g,
        protein: record.proteinPer100g,
        carbs: record.carbsPer100g,
        fat: record.fatPer100g,
        fiber: record.fiberPer100g,
    },
    servingName: record.servingName,
    servingGrams: record.servingGrams,
    favorite: record.favorite,
    nutritionQuality: record.nutritionQuality,
    version: record.version,
})

export async function searchFoods(query = '') {
    const response = await fetch(
        `${environment.VITE_API_URL}/api/foods${query ? `?q=${encodeURIComponent(query)}` : ''}`,
        { credentials: 'same-origin' },
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
            servingName: food.servingName,
            servingGrams: food.servingGrams,
            favorite: food.favorite,
            nutritionQuality: food.nutritionQuality ?? 'complete',
            caloriesPer100g: food.per100g.calories,
            proteinPer100g: food.per100g.protein,
            carbsPer100g: food.per100g.carbs,
            fatPer100g: food.per100g.fat,
            fiberPer100g: food.per100g.fiber,
        }),
    })
    if (!response.ok) throw new Error('Could not create food')
    return toFood(((await response.json()) as { data: FoodRecord }).data)
}

export async function updateFood(food: Food, changes: Omit<Food, 'id' | 'version'>) {
    if (!food.version)
        throw new Error('This example food must be imported before it can be edited.')
    const response = await authRequest(`/api/foods/${food.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            version: food.version,
            name: changes.name,
            brand: changes.brand,
            servingName: changes.servingName,
            servingGrams: changes.servingGrams,
            favorite: changes.favorite,
            nutritionQuality: changes.nutritionQuality ?? 'complete',
            caloriesPer100g: changes.per100g.calories,
            proteinPer100g: changes.per100g.protein,
            carbsPer100g: changes.per100g.carbs,
            fatPer100g: changes.per100g.fat,
            fiberPer100g: changes.per100g.fiber,
        }),
    })
    if (response.status === 409) throw new Error('Food changed elsewhere. Reload and try again.')
    if (!response.ok) throw new Error('Could not update food')
    return toFood(((await response.json()) as { data: FoodRecord }).data)
}

export async function logMeal(
    name: string,
    mealType: string,
    nutrients: Nutrients,
    nutritionQuality: 'complete' | 'estimated' | 'incomplete' = 'complete',
    foodId?: string,
) {
    const response = await authRequest('/api/meals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            id: crypto.randomUUID(),
            name,
            mealType,
            eatenAt: new Date().toISOString(),
            nutrients,
            nutritionQuality,
            favorite: false,
            foodId,
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

export async function listRecipes(): Promise<RecipeRecord[]> {
    const response = await fetch(`${environment.VITE_API_URL}/api/recipes`, {
        credentials: 'same-origin',
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

export async function listMeals(range: { from?: string; to?: string } = {}) {
    const query = new URLSearchParams(
        Object.entries(range).filter((entry): entry is [string, string] => Boolean(entry[1])),
    )
    const response = await fetch(`${environment.VITE_API_URL}/api/meals?${query}`, {
        credentials: 'same-origin',
    })
    if (!response.ok) throw new Error('Meals unavailable')
    return ((await response.json()) as { data: MealRecord[] }).data
}
