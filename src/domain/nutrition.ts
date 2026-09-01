export type Nutrients = {
    calories: number
    protein: number
    carbs: number
    fat: number
    fiber: number
    sugar?: number
    saturatedFat?: number
    sodium?: number
    potassium?: number
}

export const foodNutrientKeys: (keyof Nutrients)[] = [
    'calories',
    'protein',
    'carbs',
    'fat',
    'fiber',
    'sugar',
    'saturatedFat',
    'sodium',
    'potassium',
]

export type FoodServingOption = {
    label: string
    grams: number
}

export type Food = {
    id: string
    name: string
    brand?: string
    barcode?: string
    catalogSource?: string
    catalogId?: string
    per100g: Partial<Nutrients>
    servingName: string
    servingGrams: number
    servingOptions?: FoodServingOption[]
    favorite: boolean
    nutritionQuality?: 'complete' | 'estimated' | 'incomplete'
    version?: number
}

export type FoodAmount = { food: Food; grams: number }

export const emptyNutrients = (): Nutrients => ({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sugar: 0,
    saturatedFat: 0,
    sodium: 0,
    potassium: 0,
})

export const nutrientsFor = (food: Food, grams: number): Partial<Nutrients> => {
    const factor = grams / 100
    return Object.fromEntries(
        Object.entries(food.per100g)
            .filter(
                (entry): entry is [string, number] =>
                    typeof entry[1] === 'number' && Number.isFinite(entry[1]),
            )
            .map(([key, value]) => [key, value * factor]),
    ) as Partial<Nutrients>
}

export const totalNutrients = (items: FoodAmount[]): Nutrients =>
    items.reduce((total, item) => {
        const nutrients = nutrientsFor(item.food, item.grams)
        for (const key of Object.keys(total) as (keyof Nutrients)[])
            total[key] = (total[key] ?? 0) + (nutrients[key] ?? 0)
        return total
    }, emptyNutrients())

export const nutrientsPerServing = (items: FoodAmount[], servings: number): Nutrients => {
    if (!Number.isFinite(servings) || servings <= 0) throw new Error('Servings must be positive')
    const total = totalNutrients(items)
    return Object.fromEntries(
        Object.entries(total).map(([key, value]) => [key, value / servings]),
    ) as Nutrients
}

export const roundedNutrients = (nutrients: Partial<Nutrients>): Partial<Nutrients> =>
    Object.fromEntries(
        Object.entries(nutrients).map(([key, value]) => [key, Math.round(value * 10) / 10]),
    ) as Partial<Nutrients>
