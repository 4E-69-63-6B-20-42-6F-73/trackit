import { randomUUID } from 'node:crypto'
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type * as schemaType from '../db/schema.js'
import {
    foods,
    observationRelations,
    observations,
    preferences,
    recipeItems,
    recipes,
} from '../db/schema.js'
import { rebuildEffectiveDailyMetric } from '../data/daily-projection.js'
import { dateKeyInTimezone } from '../data/timezone.js'
import { foodCategories, foodCategoryMemberships } from '../nutrition/schema.js'
import {
    planFulfillments,
    planItems,
    planScheduleTimes,
    plannedMealCategories,
    plannedMeals,
} from './schema.js'

type Database = PostgresJsDatabase<typeof schemaType>
type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
type NutritionQuality = 'complete' | 'estimated' | 'incomplete'
type Nutrients = Record<string, number>

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const scheduledTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const mealTypeSchema = z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack'])
const categoryIdSchema = z.string().regex(/^[a-z0-9-]{1,60}$/)
const referenceSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('food'), id: z.string().uuid() }),
    z.object({ type: z.literal('recipe'), id: z.string().uuid() }),
    z.object({ type: z.literal('category'), id: categoryIdSchema }),
])
type PlanReference = z.infer<typeof referenceSchema>
const createSchema = z.object({
    scheduledDate: dateKeySchema,
    scheduledTime: scheduledTimeSchema.nullable().optional(),
    mealType: mealTypeSchema,
    reference: referenceSchema,
    amount: z.number().finite().positive(),
    position: z.number().int().nonnegative().default(0),
})
const updateSchema = z.object({
    version: z.number().int().positive(),
    scheduledDate: dateKeySchema.optional(),
    scheduledTime: scheduledTimeSchema.nullable().optional(),
    mealType: mealTypeSchema.optional(),
    reference: referenceSchema.optional(),
    amount: z.number().finite().positive().optional(),
    position: z.number().int().nonnegative().optional(),
})
const skipSchema = z.object({
    version: z.number().int().positive(),
    skipped: z.boolean(),
})
const logSchema = z.object({
    version: z.number().int().positive(),
    eatenAt: z.string().datetime(),
    amount: z.number().finite().positive().optional(),
    foodId: z.string().uuid().optional(),
})

const nutrientColumns = [
    ['calories', 'caloriesPer100g'],
    ['protein', 'proteinPer100g'],
    ['carbs', 'carbsPer100g'],
    ['fat', 'fatPer100g'],
    ['fiber', 'fiberPer100g'],
    ['sugar', 'sugarPer100g'],
    ['saturatedFat', 'saturatedFatPer100g'],
    ['sodium', 'sodiumPer100g'],
    ['potassium', 'potassiumPer100g'],
] as const

const nutrientUnit = (metric: string) =>
    metric === 'calories' ? 'kcal' : ['sodium', 'potassium'].includes(metric) ? 'mg' : 'g'

const planSelection = {
    id: planItems.id,
    scheduledDate: planItems.scheduledDate,
    scheduledTime: planScheduleTimes.scheduledTime,
    position: planItems.position,
    skippedAt: planItems.skippedAt,
    linkedObservationId: planItems.resultObservationId,
    activeObservationId: observations.id,
    version: planItems.version,
    mealType: plannedMeals.mealType,
    referenceType: plannedMeals.referenceType,
    foodId: plannedMeals.foodId,
    recipeId: plannedMeals.recipeId,
    categoryId: plannedMealCategories.categoryId,
    amount: plannedMeals.amount,
    unit: plannedMeals.unit,
    foodName: foods.name,
    recipeName: recipes.name,
    categoryName: foodCategories.name,
}

const planQuery = (database: Database) =>
    database
        .select(planSelection)
        .from(planItems)
        .innerJoin(plannedMeals, eq(plannedMeals.planItemId, planItems.id))
        .leftJoin(planScheduleTimes, eq(planScheduleTimes.planItemId, planItems.id))
        .leftJoin(plannedMealCategories, eq(plannedMealCategories.planItemId, planItems.id))
        .leftJoin(foodCategories, eq(plannedMealCategories.categoryId, foodCategories.id))
        .leftJoin(foods, eq(plannedMeals.foodId, foods.id))
        .leftJoin(recipes, eq(plannedMeals.recipeId, recipes.id))
        .leftJoin(
            observations,
            and(eq(planItems.resultObservationId, observations.id), isNull(observations.deletedAt)),
        )

type PlanRow = Awaited<ReturnType<ReturnType<typeof planQuery>['limit']>>[number]

const fulfillmentTotals = async (database: Database, planItemIds: string[]) => {
    if (!planItemIds.length) return new Map<string, number>()
    const rows = await database
        .select({
            planItemId: planFulfillments.planItemId,
            amount: sql<number>`coalesce(sum(${planFulfillments.amount}), 0)`,
        })
        .from(planFulfillments)
        .innerJoin(
            observations,
            and(eq(planFulfillments.observationId, observations.id), isNull(observations.deletedAt)),
        )
        .where(inArray(planFulfillments.planItemId, planItemIds))
        .groupBy(planFulfillments.planItemId)
    return new Map(rows.map(row => [row.planItemId, Number(row.amount)]))
}

const toPlanRecord = (row: PlanRow, fulfilledAmount = 0) => {
    const reference =
        row.referenceType === 'food'
            ? { type: 'food' as const, id: row.foodId!, name: row.foodName ?? 'Unavailable item' }
            : row.referenceType === 'recipe'
              ? {
                    type: 'recipe' as const,
                    id: row.recipeId!,
                    name: row.recipeName ?? 'Unavailable item',
                }
              : {
                    type: 'category' as const,
                    id: row.categoryId!,
                    name: row.categoryName ?? 'Unavailable food group',
                }
    return {
        id: row.id,
        kind: 'meal' as const,
        scheduledDate: row.scheduledDate,
        scheduledTime: row.scheduledTime ?? null,
        position: row.position,
        skippedAt: row.skippedAt?.toISOString() ?? null,
        resultObservationId: row.activeObservationId ?? null,
        version: Number(row.version),
        meal: {
            mealType: row.mealType as MealType,
            reference,
            amount: row.amount,
            unit: row.unit as 'g' | 'serving',
            fulfilledAmount,
        },
    }
}

const loadPlanRecord = async (database: Database, id: string) => {
    const [row] = await planQuery(database).where(eq(planItems.id, id)).limit(1)
    if (!row) return null
    const totals = await fulfillmentTotals(database, [id])
    return toPlanRecord(row, totals.get(id) ?? 0)
}

const referenceExists = async (database: Database, reference: PlanReference) => {
    if (reference.type === 'food')
        return Boolean(
            (
                await database
                    .select({ id: foods.id })
                    .from(foods)
                    .where(eq(foods.id, reference.id))
                    .limit(1)
            )[0],
        )
    if (reference.type === 'recipe')
        return Boolean(
            (
                await database
                    .select({ id: recipes.id })
                    .from(recipes)
                    .where(eq(recipes.id, reference.id))
                    .limit(1)
            )[0],
        )
    return Boolean(
        (
            await database
                .select({ id: foodCategories.id })
                .from(foodCategories)
                .where(eq(foodCategories.id, reference.id))
                .limit(1)
        )[0],
    )
}

async function mealNutrition(
    database: Database,
    reference: { type: 'food' | 'recipe'; id: string },
    amount: number,
): Promise<{ name: string; nutrients: Nutrients; quality: NutritionQuality }> {
    if (reference.type === 'food') {
        const [food] = await database
            .select()
            .from(foods)
            .where(eq(foods.id, reference.id))
            .limit(1)
        if (!food) throw new Error('reference_not_found')
        const factor = amount / 100
        const nutrients = Object.fromEntries(
            nutrientColumns.flatMap(([key, field]) => {
                const value = food[field]
                return value === null ? [] : [[key, value * factor]]
            }),
        ) as Nutrients
        return {
            name: food.name,
            nutrients,
            quality: food.nutritionQuality as NutritionQuality,
        }
    }

    const [recipe] = await database
        .select()
        .from(recipes)
        .where(eq(recipes.id, reference.id))
        .limit(1)
    if (!recipe) throw new Error('reference_not_found')
    const items = await database
        .select({ item: recipeItems, food: foods })
        .from(recipeItems)
        .innerJoin(foods, eq(recipeItems.foodId, foods.id))
        .where(eq(recipeItems.recipeId, recipe.id))
    if (!items.length) throw new Error('reference_not_found')

    const totals = Object.fromEntries(nutrientColumns.map(([key]) => [key, 0])) as Record<
        string,
        number | null
    >
    for (const { item, food } of items) {
        const factor = (item.grams / 100 / recipe.servings) * amount
        for (const [key, field] of nutrientColumns) {
            const value = food[field]
            totals[key] =
                totals[key] === null || value === null ? null : totals[key]! + value * factor
        }
    }
    const nutrients = Object.fromEntries(
        Object.entries(totals).filter((entry): entry is [string, number] => entry[1] !== null),
    )
    const quality: NutritionQuality = items.some(
        ({ food }) => food.nutritionQuality === 'incomplete',
    )
        ? 'incomplete'
        : items.some(({ food }) => food.nutritionQuality === 'estimated')
          ? 'estimated'
          : 'complete'
    return { name: recipe.name, nutrients, quality }
}

export function registerPlanRoutes(app: FastifyInstance, database: Database) {
    app.get<{ Querystring: { from?: string; to?: string } }>(
        '/api/plan-items',
        async (request, reply) => {
            const range = z
                .object({ from: dateKeySchema.optional(), to: dateKeySchema.optional() })
                .safeParse(request.query)
            if (!range.success) return reply.code(400).send({ error: 'invalid_range' })
            const conditions = [isNull(planItems.deletedAt), eq(planItems.userId, 'owner')]
            if (range.data.from) conditions.push(gte(planItems.scheduledDate, range.data.from))
            if (range.data.to) conditions.push(lte(planItems.scheduledDate, range.data.to))
            const rows = await planQuery(database)
                .where(and(...conditions))
                .orderBy(
                    planItems.scheduledDate,
                    plannedMeals.mealType,
                    sql`${planScheduleTimes.scheduledTime} asc nulls last`,
                    planItems.position,
                    planItems.createdAt,
                )
            const totals = await fulfillmentTotals(
                database,
                rows.map(row => row.id),
            )
            return { data: rows.map(row => toPlanRecord(row, totals.get(row.id) ?? 0)) }
        },
    )

    app.post('/api/plan-items', async (request, reply) => {
        const parsed = createSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_plan_item' })
        const input = parsed.data
        if (!(await referenceExists(database, input.reference)))
            return reply.code(404).send({ error: 'reference_not_found' })

        const record = await database.transaction(async transaction => {
            const [plan] = await transaction
                .insert(planItems)
                .values({
                    kind: 'meal',
                    scheduledDate: input.scheduledDate,
                    position: input.position,
                })
                .returning()
            await transaction.insert(plannedMeals).values({
                planItemId: plan.id,
                mealType: input.mealType,
                referenceType: input.reference.type,
                foodId: input.reference.type === 'food' ? input.reference.id : null,
                recipeId: input.reference.type === 'recipe' ? input.reference.id : null,
                amount: input.amount,
                unit: input.reference.type === 'recipe' ? 'serving' : 'g',
            })
            if (input.reference.type === 'category')
                await transaction.insert(plannedMealCategories).values({
                    planItemId: plan.id,
                    categoryId: input.reference.id,
                })
            if (input.scheduledTime)
                await transaction.insert(planScheduleTimes).values({
                    planItemId: plan.id,
                    scheduledTime: input.scheduledTime,
                })
            return plan
        })
        const created = await loadPlanRecord(database, record.id)
        return reply.code(201).send({ data: created })
    })

    app.patch<{ Params: { id: string } }>('/api/plan-items/:id', async (request, reply) => {
        const parsed = updateSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_plan_item' })
        const input = parsed.data
        const [current] = await planQuery(database)
            .where(and(eq(planItems.id, request.params.id), isNull(planItems.deletedAt)))
            .limit(1)
        if (!current) return reply.code(404).send({ error: 'plan_item_not_found' })
        if (Number(current.version) !== input.version)
            return reply.code(409).send({ error: 'version_conflict' })
        const totals = await fulfillmentTotals(database, [current.id])
        if (current.activeObservationId || (totals.get(current.id) ?? 0) > 0)
            return reply.code(409).send({ error: 'plan_item_fulfilled' })
        if (input.reference && !(await referenceExists(database, input.reference)))
            return reply.code(404).send({ error: 'reference_not_found' })

        const updated = await database.transaction(async transaction => {
            const [plan] = await transaction
                .update(planItems)
                .set({
                    scheduledDate: input.scheduledDate,
                    position: input.position,
                    version: input.version + 1,
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(planItems.id, request.params.id),
                        eq(planItems.version, input.version),
                        isNull(planItems.deletedAt),
                    ),
                )
                .returning()
            if (!plan) return null
            await transaction
                .update(plannedMeals)
                .set({
                    mealType: input.mealType,
                    referenceType: input.reference?.type,
                    foodId:
                        input.reference === undefined
                            ? undefined
                            : input.reference.type === 'food'
                              ? input.reference.id
                              : null,
                    recipeId:
                        input.reference === undefined
                            ? undefined
                            : input.reference.type === 'recipe'
                              ? input.reference.id
                              : null,
                    amount: input.amount,
                    unit:
                        input.reference === undefined
                            ? undefined
                            : input.reference.type === 'recipe'
                              ? 'serving'
                              : 'g',
                })
                .where(eq(plannedMeals.planItemId, request.params.id))
            if (input.reference !== undefined) {
                await transaction
                    .delete(plannedMealCategories)
                    .where(eq(plannedMealCategories.planItemId, request.params.id))
                if (input.reference.type === 'category')
                    await transaction.insert(plannedMealCategories).values({
                        planItemId: request.params.id,
                        categoryId: input.reference.id,
                    })
            }
            if (input.scheduledTime !== undefined) {
                await transaction
                    .delete(planScheduleTimes)
                    .where(eq(planScheduleTimes.planItemId, request.params.id))
                if (input.scheduledTime)
                    await transaction.insert(planScheduleTimes).values({
                        planItemId: request.params.id,
                        scheduledTime: input.scheduledTime,
                    })
            }
            return plan
        })
        if (!updated) return reply.code(409).send({ error: 'version_conflict' })
        return { data: await loadPlanRecord(database, request.params.id) }
    })

    app.post<{ Params: { id: string } }>('/api/plan-items/:id/skip', async (request, reply) => {
        const parsed = skipSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_plan_item' })
        const [current] = await planQuery(database)
            .where(and(eq(planItems.id, request.params.id), isNull(planItems.deletedAt)))
            .limit(1)
        if (!current) return reply.code(404).send({ error: 'plan_item_not_found' })
        const totals = await fulfillmentTotals(database, [current.id])
        if (current.activeObservationId || (totals.get(current.id) ?? 0) > 0)
            return reply.code(409).send({ error: 'plan_item_fulfilled' })
        const [record] = await database
            .update(planItems)
            .set({
                skippedAt: parsed.data.skipped ? new Date() : null,
                version: parsed.data.version + 1,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(planItems.id, request.params.id),
                    eq(planItems.version, parsed.data.version),
                    isNull(planItems.deletedAt),
                ),
            )
            .returning()
        if (!record) return reply.code(409).send({ error: 'version_conflict' })
        return { data: await loadPlanRecord(database, request.params.id) }
    })

    app.post<{ Params: { id: string } }>('/api/plan-items/:id/log', async (request, reply) => {
        const parsed = logSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_log_request' })
        const input = parsed.data
        const [savedPreference] = await database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const timezone = savedPreference?.timezone ?? 'UTC'

        try {
            const result = await database.transaction(async transaction => {
                const [current] = await planQuery(transaction as Database)
                    .where(and(eq(planItems.id, request.params.id), isNull(planItems.deletedAt)))
                    .limit(1)
                if (!current) throw new Error('plan_item_not_found')
                if (Number(current.version) !== input.version) throw new Error('version_conflict')
                const totals = await fulfillmentTotals(transaction as Database, [current.id])
                const fulfilledAmount = totals.get(current.id) ?? 0
                if (current.activeObservationId || fulfilledAmount >= current.amount)
                    throw new Error('plan_item_fulfilled')

                let reference: { type: 'food' | 'recipe'; id: string }
                let actualAmount: number
                if (current.referenceType === 'category') {
                    if (!input.foodId) throw new Error('category_food_required')
                    const [membership] = await transaction
                        .select({ foodId: foodCategoryMemberships.foodId })
                        .from(foodCategoryMemberships)
                        .where(
                            and(
                                eq(foodCategoryMemberships.foodId, input.foodId),
                                eq(foodCategoryMemberships.categoryId, current.categoryId!),
                            ),
                        )
                        .limit(1)
                    if (!membership) throw new Error('food_not_in_category')
                    reference = { type: 'food', id: input.foodId }
                    actualAmount = input.amount ?? Math.max(0.01, current.amount - fulfilledAmount)
                } else {
                    reference =
                        current.referenceType === 'food'
                            ? { type: 'food', id: current.foodId! }
                            : { type: 'recipe', id: current.recipeId! }
                    actualAmount = input.amount ?? current.amount
                }

                const nutrition = await mealNutrition(
                    transaction as Database,
                    reference,
                    actualAmount,
                )
                const observationId = randomUUID()
                const mealType = current.mealType as MealType
                const attributes = {
                    mealType,
                    nutrientSnapshot: nutrition.nutrients,
                    favorite: false,
                    nutritionQuality: nutrition.quality,
                    primaryDefinitionId: 'calories',
                    serving: {
                        amount: actualAmount,
                        unit: reference.type === 'food' ? ('g' as const) : ('serving' as const),
                    },
                }
                const [root] = await transaction
                    .insert(observations)
                    .values({
                        id: observationId,
                        definitionId: 'meal',
                        valueType: 'compound',
                        origin: 'manual',
                        title: nutrition.name,
                        category: 'Meals',
                        observedAt: new Date(input.eatenAt),
                        attributes,
                        metadata: {
                            planItemId: request.params.id,
                            foodId: reference.type === 'food' ? reference.id : undefined,
                            recipeId: reference.type === 'recipe' ? reference.id : undefined,
                            foodCategoryId:
                                current.referenceType === 'category' ? current.categoryId : undefined,
                        },
                    })
                    .returning()

                const components = Object.entries(nutrition.nutrients).map(
                    ([metric, value], ordinal) => ({
                        id: randomUUID(),
                        metric,
                        value,
                        unit: nutrientUnit(metric),
                        ordinal,
                    }),
                )
                if (components.length) {
                    await transaction.insert(observations).values(
                        components.map(component => ({
                            id: component.id,
                            definitionId: component.metric,
                            valueType: 'number',
                            origin: 'manual',
                            canonicalValue: component.value,
                            canonicalUnit: component.unit,
                            originalValue: component.value,
                            originalUnit: component.unit,
                            category: 'Meals',
                            observedAt: root.observedAt,
                            attributes: { nutritionQuality: nutrition.quality },
                        })),
                    )
                    await transaction.insert(observationRelations).values(
                        components.map(component => ({
                            parentObservationId: root.id,
                            childObservationId: component.id,
                            kind: 'component',
                            role: component.metric,
                            ordinal: component.ordinal,
                        })),
                    )
                }
                if (current.referenceType === 'category')
                    await transaction.insert(planFulfillments).values({
                        planItemId: current.id,
                        observationId: root.id,
                        amount: actualAmount,
                    })
                const [updated] = await transaction
                    .update(planItems)
                    .set({
                        resultObservationId:
                            current.referenceType === 'category' ? undefined : root.id,
                        skippedAt: null,
                        version: input.version + 1,
                        updatedAt: new Date(),
                    })
                    .where(
                        and(
                            eq(planItems.id, request.params.id),
                            eq(planItems.version, input.version),
                            isNull(planItems.deletedAt),
                        ),
                    )
                    .returning()
                if (!updated) throw new Error('version_conflict')
                if (reference.type === 'food')
                    await transaction
                        .update(foods)
                        .set({ lastUsedAt: new Date(input.eatenAt) })
                        .where(eq(foods.id, reference.id))
                await rebuildEffectiveDailyMetric(
                    transaction,
                    dateKeyInTimezone(root.observedAt, timezone),
                )
                return {
                    observationId: root.id,
                    fulfilledAmount:
                        current.referenceType === 'category'
                            ? fulfilledAmount + actualAmount
                            : actualAmount,
                }
            })
            return reply.code(201).send({ data: result })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'plan_log_failed'
            if (message === 'plan_item_not_found') return reply.code(404).send({ error: message })
            if (message === 'version_conflict' || message === 'plan_item_fulfilled')
                return reply.code(409).send({ error: message })
            if (message === 'reference_not_found' || message === 'food_not_in_category')
                return reply.code(404).send({ error: message })
            if (message === 'category_food_required') return reply.code(400).send({ error: message })
            throw error
        }
    })

    app.delete<{ Params: { id: string } }>('/api/plan-items/:id', async (request, reply) => {
        const parsed = z.object({ version: z.number().int().positive() }).safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_plan_item' })
        const [record] = await database
            .update(planItems)
            .set({
                deletedAt: new Date(),
                version: parsed.data.version + 1,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(planItems.id, request.params.id),
                    eq(planItems.version, parsed.data.version),
                    isNull(planItems.deletedAt),
                ),
            )
            .returning({ id: planItems.id })
        if (!record) return reply.code(409).send({ error: 'version_conflict' })
        return reply.code(204).send()
    })
}
