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
    experience: z
        .object({
            onboardingStep: z.number().int().min(0).max(5).default(0),
            onboardingComplete: z.boolean().default(false),
            dataMode: z.enum(['manual', 'health-connect', 'hybrid']).default('manual'),
            focusAreas: z
                .array(z.enum(['energy', 'nutrition', 'sleep', 'movement', 'body', 'collect']))
                .max(6)
                .default(['collect']),
            visibleCards: z
                .array(
                    z.enum(['sleep', 'heart', 'energy', 'weight', 'progress', 'trend', 'journal']),
                )
                .max(7)
                .default(['sleep', 'heart', 'energy', 'weight', 'progress', 'trend', 'journal']),
            reminders: z
                .array(
                    z.object({
                        id: z.string().uuid(),
                        label: z.string().trim().min(1).max(100),
                        kind: z.enum(['Meal', 'Water', 'Weight', 'Check-in', 'Symptom', 'Note']),
                        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
                        enabled: z.boolean(),
                    }),
                )
                .max(20)
                .default([]),
            routines: z
                .array(
                    z.object({
                        id: z.string().uuid(),
                        name: z.string().trim().min(1).max(100),
                        kinds: z.array(z.enum(['Water', 'Weight', 'Check-in', 'Symptom', 'Note'])),
                    }),
                )
                .max(20)
                .default([]),
            experiments: z
                .array(
                    z.object({
                        id: z.string().uuid(),
                        question: z.string().trim().min(1).max(240),
                        primaryMetric: z.string().trim().min(1).max(100),
                        comparisonMetric: z.string().trim().min(1).max(100).optional(),
                        startedAt: z.string().datetime(),
                        endedAt: z.string().datetime().optional(),
                        status: z.enum(['active', 'completed']).default('active'),
                    }),
                )
                .max(30)
                .default([]),
            dismissedWeeklyReflection: z.string().optional(),
        })
        .partial()
        .optional(),
})

export const goalInputSchema = z.object({
    metric: z.string().trim().min(1).max(100),
    targetValue: z.number().finite().positive(),
    canonicalUnit: z.string().trim().min(1).max(40),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional(),
    schedule: z.record(z.string(), z.unknown()).default({}),
})
export const goalRetireSchema = z.object({ effectiveTo: z.string().datetime() })

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
    barcode: z
        .string()
        .trim()
        .regex(/^\d{8,14}$/)
        .optional(),
    catalogSource: z.string().trim().max(80).optional(),
    catalogId: z.string().trim().max(160).optional(),
    caloriesPer100g: z.number().finite().nonnegative(),
    proteinPer100g: z.number().finite().nonnegative().default(0),
    carbsPer100g: z.number().finite().nonnegative().default(0),
    fatPer100g: z.number().finite().nonnegative().default(0),
    fiberPer100g: z.number().finite().nonnegative().default(0),
    sugarPer100g: z.number().finite().nonnegative().default(0),
    saturatedFatPer100g: z.number().finite().nonnegative().default(0),
    sodiumPer100g: z.number().finite().nonnegative().default(0),
    potassiumPer100g: z.number().finite().nonnegative().default(0),
    servingName: z.string().trim().min(1).max(60).default('serving'),
    servingGrams: z.number().finite().positive().default(100),
    favorite: z.boolean().default(false),
    nutritionQuality: z.enum(['complete', 'estimated', 'incomplete']).default('complete'),
})

export const foodUpdateSchema = foodInputSchema.partial().extend({
    version: z.number().int().positive(),
})

export const foodImportSchema = z.object({
    duplicateStrategy: z.enum(['skip', 'update', 'create']).default('skip'),
    foods: z.array(foodInputSchema).min(1).max(1000),
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
    importFoods(input: z.infer<typeof foodImportSchema>): Promise<unknown>
    listRecipes(): Promise<unknown[]>
    createRecipe(input: z.infer<typeof recipeInputSchema>): Promise<unknown>
    updateRecipe(id: string, input: z.infer<typeof recipeUpdateSchema>): Promise<unknown | null>
    listGoals(): Promise<unknown[]>
    createGoal(input: z.infer<typeof goalInputSchema>): Promise<unknown>
    retireGoal(id: string, effectiveTo: string): Promise<unknown | null>
    listSavedTrendViews(): Promise<unknown[]>
    createSavedTrendView(input: z.infer<typeof savedTrendViewInputSchema>): Promise<unknown>
}
