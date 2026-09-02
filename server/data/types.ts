import { z } from 'zod'
import type { NumericObservation } from '@trackit/domain/health'
import type { MealSourceItem } from '@trackit/domain/types'
import { validateGoal } from '@trackit/domain/goals'
import { observationDefinition } from '@trackit/domain/observationDefinitions'
import type {
    dailyMetrics,
    foods,
    goals,
    healthRecords,
    observations,
    preferences,
    recipeItems,
    recipes,
    savedTrendViews,
    sources,
} from '../db/schema.js'

export const observationInputSchema = z
    .object({
        id: z.string().uuid().optional(),
        definitionId: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .refine(value => observationDefinition(value), 'Unknown observation definition'),
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
        const definition = observationDefinition(input.definitionId)
        if (definition && definition.valueType !== input.valueType)
            context.addIssue({
                code: 'custom',
                path: ['valueType'],
                message: `${input.definitionId} observations require ${definition.valueType} values`,
            })
        if (input.valueType === 'number' && (input.value === undefined || !input.unit))
            context.addIssue({
                code: 'custom',
                message: 'Numeric observations require value and unit',
            })
        if (input.valueType === 'number' && definition?.metric && input.unit) {
            const allowedUnits = [
                ...definition.metric.displayUnits,
                ...(definition.metric.inputUnits ?? []),
            ]
            if (!allowedUnits.includes(input.unit))
                context.addIssue({
                    code: 'custom',
                    path: ['unit'],
                    message: `${input.definitionId} does not support ${input.unit}`,
                })
        }
        if (
            input.valueType === 'number' &&
            input.value !== undefined &&
            definition?.metric?.validRange &&
            (input.value < definition.metric.validRange.min ||
                input.value > definition.metric.validRange.max)
        )
            context.addIssue({
                code: 'custom',
                path: ['value'],
                message: `${input.definitionId} must be between ${definition.metric.validRange.min} and ${definition.metric.validRange.max}`,
            })
        if (input.valueType === 'text' && input.textValue === undefined)
            context.addIssue({ code: 'custom', message: 'Text observations require textValue' })
    })

/** UTC instant range. `from` is inclusive and `to` is exclusive. */
export type RecordRange = { from?: string; to?: string; definitionIds?: string[] }

const mealServingSchema = z.object({
    amount: z.number().finite().positive(),
    unit: z.enum(['g', 'serving']),
})

export const mealInputSchema = z
    .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(160),
        mealType: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']),
        eatenAt: z.string().datetime(),
        nutrients: z.record(z.string(), z.number().finite()).default({}),
        nutritionQuality: z.enum(['complete', 'estimated', 'incomplete']).default('complete'),
        favorite: z.boolean().default(false),
        foodId: z.string().uuid().optional(),
        recipeId: z.string().uuid().optional(),
        serving: mealServingSchema.optional(),
    })
    .superRefine((input, context) => {
        if (input.foodId && input.recipeId)
            context.addIssue({
                code: 'custom',
                path: ['recipeId'],
                message: 'A meal can reference either a food or a recipe, not both',
            })
    })

export const mealUpdateSchema = z
    .object({
        name: z.string().trim().min(1).max(160).optional(),
        mealType: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']).optional(),
        eatenAt: z.string().datetime().optional(),
        nutrients: z.record(z.string(), z.number().finite()).optional(),
        nutritionQuality: z.enum(['complete', 'estimated', 'incomplete']).optional(),
        favorite: z.boolean().optional(),
        serving: mealServingSchema.nullable().optional(),
        foodId: z.string().uuid().nullable().optional(),
        recipeId: z.string().uuid().nullable().optional(),
        version: z.number().int().positive(),
    })
    .superRefine((input, context) => {
        if (input.foodId && input.recipeId)
            context.addIssue({
                code: 'custom',
                path: ['recipeId'],
                message: 'A meal can reference either a food or a recipe, not both',
            })
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
    mcpEnabled: z.boolean().optional(),
    experience: z
        .object({
            onboardingStep: z.number().int().min(0).max(10).optional(),
            onboardingComplete: z.boolean().optional(),
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
        definitionId: z.string().trim().min(1).max(100),
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
    definitionId: z.string().trim().min(1).max(100),
    comparisonDefinitionId: z.string().trim().min(1).max(100).optional(),
    rangeDays: z.number().int().min(2).max(3650),
    granularity: z.enum(['daily', 'weekly']).default('daily'),
})

export const observationUpdateSchema = z.object({
    excluded: z.boolean().optional(),
    title: z.string().trim().min(1).max(160).optional(),
    textValue: z.string().max(2000).optional(),
    detail: z.string().max(2000).optional(),
    observedAt: z.string().datetime().optional(),
    version: z.number().int().positive(),
})

const foodServingOptionSchema = z.object({
    label: z.string().trim().min(1).max(60),
    grams: z.number().finite().positive(),
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
    servingOptions: z.array(foodServingOptionSchema).max(12).default([]),
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

export type ObservationInput = z.infer<typeof observationInputSchema>
export type ObservationUpdate = z.infer<typeof observationUpdateSchema>
export type MealInput = z.infer<typeof mealInputSchema>
export type MealUpdate = z.infer<typeof mealUpdateSchema>
export type PreferencesInput = z.infer<typeof preferencesInputSchema>
export type GoalInput = z.infer<typeof goalInputSchema>
export type GoalUpdate = z.infer<typeof goalUpdateSchema>
export type SavedTrendViewInput = z.infer<typeof savedTrendViewInputSchema>
export type FoodInput = z.infer<typeof foodInputSchema>
export type FoodUpdate = z.infer<typeof foodUpdateSchema>
export type FoodImportInput = z.infer<typeof foodImportSchema>
export type RecipeInput = z.infer<typeof recipeInputSchema>
export type RecipeUpdate = z.infer<typeof recipeUpdateSchema>

export type SourceRecord = typeof sources.$inferSelect
export type HealthRecordRecord = typeof healthRecords.$inferSelect
export type DailyMetricRecord = typeof dailyMetrics.$inferSelect
export type RawObservationRecord = typeof observations.$inferSelect
export type PreferencesRecord = typeof preferences.$inferSelect
export type FoodRecord = typeof foods.$inferSelect

type PersistedGoalRecord = typeof goals.$inferSelect
export type GoalRecord = Omit<PersistedGoalRecord, 'effectiveFrom' | 'effectiveTo'> & {
    effectiveFrom: Date | string
    effectiveTo: Date | string | null
}

export type SavedTrendViewRecord = typeof savedTrendViews.$inferSelect

export type MetricSourceSummary = {
    definitionId: string
    provider: string
    connector: string | null
}

export type MealRecord = {
    id: string
    name: string
    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
    eatenAt: Date
    nutrientSnapshot: Record<string, number>
    nutritionQuality: 'complete' | 'estimated' | 'incomplete'
    favorite: boolean
    serving?: { amount: number; unit: 'g' | 'serving' }
    sourceItem?: MealSourceItem
    sourceId: string | null
    version: number
    createdAt: Date
    updatedAt: Date
    deletedAt: Date | null
}

type NutrientKey =
    | 'calories'
    | 'protein'
    | 'carbs'
    | 'fat'
    | 'fiber'
    | 'sugar'
    | 'saturatedFat'
    | 'sodium'
    | 'potassium'

export type RecipeRecord = typeof recipes.$inferSelect & {
    items: Array<typeof recipeItems.$inferSelect & { foodName: string }>
    nutrientsPerServing: Record<NutrientKey, number | null>
    nutritionQuality: string
}

export type CreatedRecipeRecord = typeof recipes.$inferSelect & {
    items: Array<typeof recipeItems.$inferSelect>
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

export interface SourceRepository {
    listSources(): Promise<SourceRecord[]>
}

export interface HealthProjectionRepository {
    listHealthRecords(): Promise<HealthRecordRecord[]>
    listDailyMetrics(range?: { from?: string; to?: string }): Promise<DailyMetricRecord[]>
}

export interface ObservationRepository {
    listMetricSources(): Promise<MetricSourceSummary[]>
    listRawObservations(range?: RecordRange): Promise<RawObservationRecord[]>
    listObservations(range?: RecordRange): Promise<NumericObservation[]>
    createObservation(input: ObservationInput): Promise<RawObservationRecord | undefined>
    updateObservation(id: string, input: ObservationUpdate): Promise<RawObservationRecord | null>
    removeObservation(id: string): Promise<boolean>
}

export interface MealRepository {
    listMeals(range?: RecordRange): Promise<MealRecord[]>
    createMeal(input: MealInput): Promise<MealRecord | undefined>
    updateMeal(id: string, input: MealUpdate): Promise<MealRecord | null>
    removeMeal(id: string): Promise<boolean>
}

export interface PreferencesRepository {
    getPreferences(): Promise<PreferencesRecord>
    updatePreferences(input: PreferencesInput): Promise<PreferencesRecord>
}

export interface FoodRepository {
    listFoods(query?: string): Promise<FoodRecord[]>
    createFood(input: FoodInput): Promise<FoodRecord>
    updateFood(id: string, input: FoodUpdate): Promise<FoodRecord | null>
    importFoods(input: FoodImportInput): Promise<FoodImportResult>
}

export interface RecipeRepository {
    listRecipes(): Promise<RecipeRecord[]>
    createRecipe(input: RecipeInput): Promise<CreatedRecipeRecord>
    updateRecipe(id: string, input: RecipeUpdate): Promise<typeof recipes.$inferSelect | null>
}

export interface GoalRepository {
    listGoals(): Promise<GoalRecord[]>
    createGoal(input: GoalInput): Promise<GoalRecord>
    retireGoal(id: string, effectiveTo: string): Promise<GoalRecord | null>
    updateGoal(id: string, input: GoalUpdate): Promise<GoalRecord | null>
    removeGoal(id: string): Promise<boolean>
}

export interface TrendViewRepository {
    listSavedTrendViews(): Promise<SavedTrendViewRecord[]>
    createSavedTrendView(input: SavedTrendViewInput): Promise<SavedTrendViewRecord>
}

export type NutritionRepository = MealRepository & FoodRepository & RecipeRepository

/**
 * Application-level composition for wiring the concrete repository. Feature modules should depend on
 * the narrow capability interfaces above rather than this aggregate type.
 */
export type DataRepository = SourceRepository &
    HealthProjectionRepository &
    ObservationRepository &
    NutritionRepository &
    PreferencesRepository &
    GoalRepository &
    TrendViewRepository
