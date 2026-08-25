import { z } from 'zod'
import { validateGoal } from '../../src/domain/goals.js'

export const observationInputSchema = z
    .object({
        id: z.string().uuid().optional(),
        metric: z.string().trim().min(1).max(100),
        valueType: z.enum(['number', 'text', 'boolean', 'category', 'event']).default('number'),
        value: z.number().finite().optional(),
        unit: z.string().trim().min(1).max(40).optional(),
        textValue: z.string().max(2000).optional(),
        detail: z.string().max(2000).optional(),
        booleanValue: z.boolean().optional(),
        categoryValue: z.string().max(160).optional(),
        title: z.string().trim().min(1).max(160).optional(),
        category: z.enum(['Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins']).optional(),
        attributes: z.record(z.string(), z.unknown()).default({}),
        observedAt: z.string().datetime(),
        source: z.string().trim().min(1).max(120).default('You'),
    })
    .superRefine((input, context) => {
        if (input.valueType === 'number' && (input.value === undefined || !input.unit))
            context.addIssue({
                code: 'custom',
                message: 'Numeric observations require value and unit',
            })
        if (input.valueType === 'text' && input.textValue === undefined)
            context.addIssue({ code: 'custom', message: 'Text observations require textValue' })
    })

/** UTC instant range. `from` is inclusive and `to` is exclusive. */
export type RecordRange = { from?: string; to?: string; metrics?: string[] }

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
    metricPreferences: z
        .record(
            z.string(),
            z.object({
                displayUnit: z.string().trim().min(1).max(20),
                precision: z.number().int().min(0).max(6).optional(),
                showInJournal: z.boolean().optional(),
                deduplication: z
                    .object({
                        policy: z.enum(['keep_all', 'prefer_priority', 'metric_merge']),
                        sourcePriority: z.array(z.string().trim().min(1).max(240)).max(50),
                        disabledSources: z
                            .array(z.string().trim().min(1).max(240))
                            .max(50)
                            .optional(),
                    })
                    .optional(),
            }),
        )
        .optional(),
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

const goalTargetSchema = z.union([
    z.object({ value: z.number().finite() }),
    z.object({ min: z.number().finite(), max: z.number().finite() }),
])
const goalPeriodSchema = z.union([
    z.object({ type: z.literal('day') }),
    z.object({ type: z.literal('week') }),
    z.object({
        type: z.literal('rolling'),
        days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
    }),
])
export const goalInputSchema = z
    .object({
        metricId: z.string().trim().min(1).max(100),
        aggregation: z.enum(['latest', 'average', 'total']),
        comparator: z.enum(['gte', 'lte', 'between']),
        target: goalTargetSchema,
        period: goalPeriodSchema,
        canonicalUnit: z.string().trim().min(1).max(40),
        effectiveFrom: z.string().datetime(),
        effectiveTo: z.string().datetime().nullable().optional(),
        schedule: z
            .object({ weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional() })
            .default({}),
    })
    .superRefine((goal, context) =>
        validateGoal({ ...goal, effectiveTo: goal.effectiveTo ?? null }).forEach(message =>
            context.addIssue({ code: 'custom', message }),
        ),
    )
export const goalRetireSchema = z.object({ effectiveTo: z.string().datetime() })
export const goalUpdateSchema = z.union([goalInputSchema, goalRetireSchema])

export const savedTrendViewInputSchema = z.object({
    name: z.string().trim().min(1).max(100),
    metric: z.string().trim().min(1).max(100),
    comparisonMetric: z.string().trim().min(1).max(100).optional(),
    rangeDays: z.number().int().min(2).max(3650),
    granularity: z.enum(['daily', 'weekly']).default('daily'),
})

export const observationUpdateSchema = z.object({
    excluded: z.boolean().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    textValue: z.string().max(2000).optional(),
    observedAt: z.string().datetime().optional(),
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
    caloriesPer100g: z.number().finite().nonnegative().nullish(),
    proteinPer100g: z.number().finite().nonnegative().nullish(),
    carbsPer100g: z.number().finite().nonnegative().nullish(),
    fatPer100g: z.number().finite().nonnegative().nullish(),
    fiberPer100g: z.number().finite().nonnegative().nullish(),
    sugarPer100g: z.number().finite().nonnegative().nullish(),
    saturatedFatPer100g: z.number().finite().nonnegative().nullish(),
    sodiumPer100g: z.number().finite().nonnegative().nullish(),
    potassiumPer100g: z.number().finite().nonnegative().nullish(),
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
    listMetricSources?(): Promise<unknown[]>
    listHealthRecords?(): Promise<unknown[]>
    listDailyMetrics?(range?: { from?: string; to?: string }): Promise<unknown[]>
    listRawObservations?(range?: RecordRange): Promise<unknown[]>
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
    updateGoal(id: string, input: z.infer<typeof goalUpdateSchema>): Promise<unknown | null>
    removeGoal(id: string): Promise<boolean>
    listSavedTrendViews(): Promise<unknown[]>
    createSavedTrendView(input: z.infer<typeof savedTrendViewInputSchema>): Promise<unknown>
}
