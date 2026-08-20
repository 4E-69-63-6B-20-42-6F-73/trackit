import { z } from 'zod'

export const observationInputSchema = z.object({
    id: z.string().uuid().optional(),
    metric: z.string().trim().min(1).max(100),
    value: z.number().finite(),
    unit: z.string().trim().min(1).max(40),
    observedAt: z.string().datetime(),
    source: z.string().trim().min(1).max(120).default('You'),
})

export type RecordRange = { from?: string; to?: string }

export const mealInputSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(160),
    mealType: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']),
    eatenAt: z.string().datetime(),
    nutrients: z.record(z.string(), z.number().finite()).default({}),
    nutritionQuality: z.enum(['complete', 'estimated', 'incomplete']).default('complete'),
    favorite: z.boolean().default(false),
    foodId: z.string().uuid().optional(),
})

export const mealUpdateSchema = z.object({
    name: z.string().trim().min(1).max(160).optional(),
    mealType: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']).optional(),
    eatenAt: z.string().datetime().optional(),
    nutrients: z.record(z.string(), z.number().finite()).optional(),
    nutritionQuality: z.enum(['complete', 'estimated', 'incomplete']).optional(),
    favorite: z.boolean().optional(),
    version: z.number().int().positive(),
})

export const preferencesInputSchema = z.object({
    displayName: z.string().trim().min(1).max(100).optional(),
    timezone: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .refine(value => {
            try {
                new Intl.DateTimeFormat('en', { timeZone: value }).format()
                return true
            } catch {
                return false
            }
        }, 'Invalid IANA timezone')
        .optional(),
    locale: z
        .string()
        .trim()
        .min(2)
        .max(20)
        .refine(value => {
            try {
                Intl.getCanonicalLocales(value)
                return true
            } catch {
                return false
            }
        }, 'Invalid locale')
        .optional(),
    units: z.enum(['metric', 'imperial']).optional(),
    goals: z.record(z.string(), z.number().finite()).optional(),
    mcpEnabled: z.boolean().optional(),
})

export const goalInputSchema = z.object({
    metric: z.string().trim().min(1).max(100),
    targetValue: z.number().finite().positive(),
    canonicalUnit: z.string().trim().min(1).max(40),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional(),
    schedule: z.record(z.string(), z.unknown()).default({}),
})

export const savedTrendViewInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    metric: z.string().trim().min(1).max(100),
    comparisonMetric: z.string().trim().min(1).max(100).optional(),
    rangeDays: z.number().int().min(2).max(3650),
    granularity: z.enum(['daily', 'weekly']).default('daily'),
})

export const observationUpdateSchema = z.object({
    excluded: z.boolean(),
    version: z.number().int().positive(),
})

export const foodInputSchema = z.object({
    name: z.string().trim().min(1).max(160),
    brand: z.string().trim().max(120).optional(),
    caloriesPer100g: z.number().finite().nonnegative(),
    proteinPer100g: z.number().finite().nonnegative().default(0),
    carbsPer100g: z.number().finite().nonnegative().default(0),
    fatPer100g: z.number().finite().nonnegative().default(0),
    fiberPer100g: z.number().finite().nonnegative().default(0),
    servingName: z.string().trim().min(1).max(60).default('serving'),
    servingGrams: z.number().finite().positive().default(100),
    favorite: z.boolean().default(false),
    nutritionQuality: z.enum(['complete', 'estimated', 'incomplete']).default('complete'),
})

export const foodUpdateSchema = foodInputSchema.partial().extend({
    version: z.number().int().positive(),
})

export const recipeInputSchema = z.object({
    name: z.string().trim().min(1).max(160),
    servings: z.number().finite().positive(),
    favorite: z.boolean().default(false),
    items: z
        .array(
            z.object({
                foodId: z.string().uuid(),
                grams: z.number().finite().positive(),
            }),
        )
        .min(1),
})

export const recipeUpdateSchema = z.object({
    servings: z.number().finite().positive(),
    version: z.number().int().positive(),
})

export interface DataRepository {
    listSources(): Promise<unknown[]>
    listObservations(range?: RecordRange): Promise<unknown[]>
    createObservation(input: z.infer<typeof observationInputSchema>): Promise<unknown>
    updateObservation(
        id: string,
        input: z.infer<typeof observationUpdateSchema>,
    ): Promise<unknown | null>
    removeObservation(id: string): Promise<boolean>
    listMeals(range?: RecordRange): Promise<unknown[]>
    createMeal(input: z.infer<typeof mealInputSchema>): Promise<unknown>
    updateMeal(id: string, input: z.infer<typeof mealUpdateSchema>): Promise<unknown | null>
    removeMeal(id: string): Promise<boolean>
    getPreferences(): Promise<unknown>
    updatePreferences(input: z.infer<typeof preferencesInputSchema>): Promise<unknown>
    listFoods(query?: string): Promise<unknown[]>
    createFood(input: z.infer<typeof foodInputSchema>): Promise<unknown>
    updateFood(id: string, input: z.infer<typeof foodUpdateSchema>): Promise<unknown | null>
    listRecipes(): Promise<unknown[]>
    createRecipe(input: z.infer<typeof recipeInputSchema>): Promise<unknown>
    updateRecipe(id: string, input: z.infer<typeof recipeUpdateSchema>): Promise<unknown | null>
    listGoals(): Promise<unknown[]>
    createGoal(input: z.infer<typeof goalInputSchema>): Promise<unknown>
    listSavedTrendViews(): Promise<unknown[]>
    createSavedTrendView(input: z.infer<typeof savedTrendViewInputSchema>): Promise<unknown>
}
