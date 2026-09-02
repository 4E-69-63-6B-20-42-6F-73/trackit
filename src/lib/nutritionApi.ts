import type { Food, Nutrients } from '@trackit/domain/nutrition'
import type { paths } from './api.generated'
import { apiClient } from './apiClient'

type FoodRecord =
    paths['/api/foods']['get']['responses'][200]['content']['application/json']['data'][number]
type CatalogFoodRecord =
    paths['/api/food-catalog/search']['get']['responses'][200]['content']['application/json']['data'][number]
type ApiRecipeRecord =
    paths['/api/recipes']['get']['responses'][200]['content']['application/json']['data'][number]
type FoodInput = paths['/api/foods']['post']['requestBody']['content']['application/json']

export type MealRecord =
    paths['/api/meals']['get']['responses'][200]['content']['application/json']['data'][number]
export type FoodImportResult =
    paths['/api/foods/import']['post']['responses'][200]['content']['application/json']['data']
export type RecipeRecord = Omit<ApiRecipeRecord, 'nutrientsPerServing'> & {
    nutrientsPerServing: Nutrients
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
    servingOptions: record.servingOptions,
    favorite: record.favorite,
    nutritionQuality: record.nutritionQuality,
    version: record.version,
})

const foodInput = (food: Omit<Food, 'id'>): FoodInput => ({
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    catalogSource: food.catalogSource,
    catalogId: food.catalogId,
    servingName: food.servingName,
    servingGrams: food.servingGrams,
    servingOptions: food.servingOptions ?? [],
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
})

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
    servingOptions: record.servingOptions,
    favorite: false,
    nutritionQuality: record.nutritionQuality,
})

const toRecipe = (record: ApiRecipeRecord): RecipeRecord => ({
    ...record,
    nutrientsPerServing: {
        calories: record.nutrientsPerServing.calories ?? 0,
        protein: record.nutrientsPerServing.protein ?? 0,
        carbs: record.nutrientsPerServing.carbs ?? 0,
        fat: record.nutrientsPerServing.fat ?? 0,
        fiber: record.nutrientsPerServing.fiber ?? 0,
        sugar: record.nutrientsPerServing.sugar ?? 0,
        saturatedFat: record.nutrientsPerServing.saturatedFat ?? 0,
        sodium: record.nutrientsPerServing.sodium ?? 0,
        potassium: record.nutrientsPerServing.potassium ?? 0,
    },
})

const numericNutrients = (nutrients: Partial<Nutrients>) =>
    Object.fromEntries(
        Object.entries(nutrients).filter((entry): entry is [string, number] =>
            Number.isFinite(entry[1]),
        ),
    )

export async function searchFoods(query = '') {
    const { data, response } = await apiClient.GET('/api/foods', {
        params: { query: { q: query || undefined } },
    })
    if (!response.ok || !data) throw new Error('Food search unavailable')
    return data.data.map(toFood)
}

export async function createFood(food: Omit<Food, 'id'>) {
    const { data, response } = await apiClient.POST('/api/foods', { body: foodInput(food) })
    if (!response.ok || !data) throw new Error('Could not create food')
    return toFood(data.data)
}

export async function importFoods(
    foods: Array<Omit<Food, 'id' | 'version'>>,
    duplicateStrategy: 'skip' | 'update' | 'create',
): Promise<FoodImportResult> {
    const { data, response } = await apiClient.POST('/api/foods/import', {
        body: { duplicateStrategy, foods: foods.map(foodInput) },
    })
    if (!response.ok || !data) throw new Error('The server could not import this catalog.')
    return data.data
}

export async function lookupCatalogBarcode(barcode: string) {
    const { data, response } = await apiClient.GET('/api/food-catalog/barcode/{barcode}', {
        params: { path: { barcode } },
    })
    if (response.status === 404) return null
    if (response.status === 503)
        throw new Error('No external food catalog is configured on this server.')
    if (!response.ok || !data) throw new Error('The food catalog is unavailable. Try again later.')
    return catalogToFood(data.data)
}

export async function searchFoodCatalog(query: string) {
    const { data, response } = await apiClient.GET('/api/food-catalog/search', {
        params: { query: { q: query } },
    })
    if (response.status === 503)
        throw new Error('No external food catalog is configured on this server.')
    if (!response.ok || !data) throw new Error('The food catalog is unavailable. Try again later.')
    return data.data.map(catalogToFood)
}

export async function updateFood(food: Food, changes: Omit<Food, 'id' | 'version'>) {
    if (!food.version) throw new Error('This food is not stored on the server.')
    const { data, response } = await apiClient.PATCH('/api/foods/{id}', {
        params: { path: { id: food.id } },
        body: { version: food.version, ...foodInput(changes) },
    })
    if (response.status === 409) throw new Error('Food changed elsewhere. Reload and try again.')
    if (!response.ok || !data) throw new Error('Could not update food')
    return toFood(data.data)
}

export async function deleteFood(food: Food) {
    if (!food.version) throw new Error('This food is not stored on the server.')
    const { error, response } = await apiClient.DELETE('/api/foods/{id}', {
        params: { path: { id: food.id } },
        body: { version: food.version },
    })
    if (response.status === 409 && error) {
        if (error.error === 'food_in_use' && 'recipes' in error) {
            const names = error.recipes?.map(recipe => recipe.name).filter(Boolean) ?? []
            const planCount = error.plannedMeals ?? 0
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
    mealType: MealRecord['mealType'],
    nutrients: Partial<Nutrients>,
    nutritionQuality: 'complete' | 'estimated' | 'incomplete' = 'complete',
    foodId?: string,
    eatenAt = new Date().toISOString(),
    serving?: { amount: number; unit: 'g' | 'serving' },
    recipeId?: string,
) {
    const { response } = await apiClient.POST('/api/meals', {
        body: {
            id: crypto.randomUUID(),
            name,
            mealType,
            eatenAt,
            nutrients: numericNutrients(nutrients),
            nutritionQuality,
            favorite: false,
            foodId,
            recipeId,
            serving,
        },
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
        foodId: string | null
        recipeId: string | null
    }>,
) {
    const { data, response } = await apiClient.PATCH('/api/meals/{id}', {
        params: { path: { id } },
        body: { version, ...changes },
    })
    if (!response.ok || !data) throw new Error('Could not update meal')
    return data.data
}

export async function deleteMeal(id: string): Promise<void> {
    const { response } = await apiClient.DELETE('/api/meals/{id}', {
        params: { path: { id } },
    })
    if (!response.ok && response.status !== 404)
        throw new Error(`Meal delete failed (${response.status})`)
}

export async function listRecipes(): Promise<RecipeRecord[]> {
    const { data, response } = await apiClient.GET('/api/recipes')
    if (!response.ok || !data) throw new Error('Recipes unavailable')
    return data.data.map(toRecipe)
}

export async function createRecipe(input: {
    name: string
    servings: number
    favorite: boolean
    items: { foodId: string; grams: number }[]
}) {
    const { data, response } = await apiClient.POST('/api/recipes', { body: input })
    if (!response.ok || !data) throw new Error('Could not create recipe')
    return data.data
}

export async function updateRecipeYield(recipe: RecipeRecord, servings: number) {
    const { response } = await apiClient.PATCH('/api/recipes/{id}', {
        params: { path: { id: recipe.id } },
        body: { servings, version: recipe.version },
    })
    if (response.status === 409) throw new Error('Recipe changed elsewhere. Reload and try again.')
    if (!response.ok) throw new Error('Could not update recipe yield')
}

export async function listMeals(range: { from?: string; to?: string } = {}, signal?: AbortSignal) {
    const { data, response } = await apiClient.GET('/api/meals', {
        params: { query: range },
        signal,
    })
    if (!response.ok || !data) throw new Error('Meals unavailable')
    return data.data
}
