import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    foods,
    healthRecords,
    dailyMetrics,
    goals,
    meals,
    observations,
    preferences,
    sources,
    recipeItems,
    recipes,
    savedTrendViews,
} from '../db/schema.js'
import type { DataRepository, RecordRange } from './types.js'
import { effectiveMetricSeries } from '../../src/domain/effectiveMetrics.js'
import type { Observation } from '../../src/domain/health.js'
import type { MetricPreferences } from '../../src/domain/metrics.js'

type Database = PostgresJsDatabase<typeof schemaType>

const normalizeFoodSearch = (value: string) =>
    value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()

const editDistance = (left: string, right: string) => {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        const current = [leftIndex]
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            current[rightIndex] = Math.min(
                current[rightIndex - 1] + 1,
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
            )
        }
        previous.splice(0, previous.length, ...current)
    }
    return previous[right.length]
}

const foodMatchScore = (query: string, name: string, brand?: string | null) => {
    const normalizedName = normalizeFoodSearch(name)
    const combined = normalizeFoodSearch(`${name} ${brand ?? ''}`)
    if (normalizedName === query) return 0
    if (normalizedName.startsWith(query)) return 0.1
    if (normalizedName.includes(query)) return 0.2
    if (combined.includes(query)) return 0.3
    const queryTokens = query.split(' ')
    if (queryTokens.every(token => combined.split(' ').some(word => word.startsWith(token)))) {
        return 0.4
    }
    const words = combined.split(' ')
    const distance = Math.min(
        editDistance(query, normalizedName),
        ...words.map(word => editDistance(query, word)),
    )
    const ratio = distance / Math.max(query.length, normalizedName.length, 1)
    return ratio <= 0.34 || (query.length >= 5 && distance <= 2) ? 0.5 + ratio : Infinity
}

export class PostgresDataRepository implements DataRepository {
    listHealthRecords() {
        return this.database.select().from(healthRecords).orderBy(desc(healthRecords.startTime))
    }

    listDailyMetrics(range: { from?: string; to?: string } = {}) {
        const conditions = []
        if (range.from) conditions.push(gte(dailyMetrics.date, range.from))
        if (range.to) conditions.push(lte(dailyMetrics.date, range.to))
        return this.database
            .select()
            .from(dailyMetrics)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(dailyMetrics.date))
    }

    listSources() {
        return this.database.select().from(sources).orderBy(sources.name)
    }

    listMetricSources() {
        const provider = sql<string>`coalesce(
            nullif(${observations.metadata}->>'dataOrigin', ''),
            nullif(${observations.metadata}->>'source', ''),
            'Manual'
        )`
        const connector = sql<string | null>`coalesce(
            nullif(${observations.metadata}->>'connector', ''),
            case
                when ${observations.metadata}->>'source' = 'Health Connect' then 'Health Connect'
                else null
            end
        )`
        return this.database
            .selectDistinct({ metric: observations.metric, provider, connector })
            .from(observations)
            .where(isNull(observations.deletedAt))
            .orderBy(observations.metric, provider, connector)
    }

    constructor(private readonly database: Database) {}

    async listObservations(range: RecordRange = {}) {
        const conditions = [isNull(observations.deletedAt)]
        if (range.from) conditions.push(gte(observations.observedAt, new Date(range.from)))
        if (range.to) conditions.push(lte(observations.observedAt, new Date(range.to)))
        const records = await this.database
            .select()
            .from(observations)
            .where(and(...conditions))
            .orderBy(desc(observations.observedAt))
        if (range.series === 'raw') return records
        const [saved] = await this.database
            .select({ metricPreferences: preferences.metricPreferences })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const normalized = records.map(record => ({
            ...record,
            observedAt: record.observedAt.toISOString(),
            endedAt: record.endedAt?.toISOString() ?? null,
            metadata: record.metadata as Record<string, unknown>,
            version: Number(record.version),
        })) as Observation[]
        return effectiveMetricSeries(
            normalized,
            (saved?.metricPreferences ?? undefined) as MetricPreferences | undefined,
        )
    }

    async createObservation(input: {
        id?: string
        metric: string
        value: number
        unit: string
        observedAt: string
        source: string
    }) {
        const [record] = await this.database
            .insert(observations)
            .values({
                id: input.id,
                metric: input.metric,
                canonicalValue: input.value,
                canonicalUnit: input.unit,
                originalValue: input.value,
                originalUnit: input.unit,
                observedAt: new Date(input.observedAt),
                metadata: { source: input.source },
            })
            .onConflictDoNothing({ target: observations.id })
            .returning()
        if (record) return record
        const [existing] = await this.database
            .select()
            .from(observations)
            .where(eq(observations.id, input.id!))
        return existing
    }

    async updateObservation(id: string, input: { excluded: boolean; version: number }) {
        const [record] = await this.database
            .update(observations)
            .set({
                excluded: input.excluded,
                version: input.version + 1,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(observations.id, id),
                    eq(observations.version, input.version),
                    isNull(observations.deletedAt),
                ),
            )
            .returning()
        return record ?? null
    }

    async removeObservation(id: string) {
        const removed = await this.database
            .update(observations)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(observations.id, id), isNull(observations.deletedAt)))
            .returning({ id: observations.id })
        return removed.length > 0
    }

    listMeals(range: RecordRange = {}) {
        const conditions = [isNull(meals.deletedAt)]
        if (range.from) conditions.push(gte(meals.eatenAt, new Date(range.from)))
        if (range.to) conditions.push(lte(meals.eatenAt, new Date(range.to)))
        return this.database
            .select()
            .from(meals)
            .where(and(...conditions))
            .orderBy(desc(meals.eatenAt))
    }

    async createMeal(input: {
        id?: string
        name: string
        mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
        eatenAt: string
        nutrients: Record<string, number>
        favorite: boolean
        nutritionQuality: 'complete' | 'estimated' | 'incomplete'
        foodId?: string
    }) {
        const [record] = await this.database
            .insert(meals)
            .values({
                id: input.id,
                name: input.name,
                mealType: input.mealType,
                eatenAt: new Date(input.eatenAt),
                nutrientSnapshot: input.nutrients,
                favorite: input.favorite,
                nutritionQuality: input.nutritionQuality,
            })
            .onConflictDoNothing({ target: meals.id })
            .returning()
        if (record) {
            if (input.foodId) {
                await this.database
                    .update(foods)
                    .set({ lastUsedAt: new Date(input.eatenAt) })
                    .where(eq(foods.id, input.foodId))
            }
            return record
        }
        const [existing] = await this.database.select().from(meals).where(eq(meals.id, input.id!))
        return existing
    }

    async updateMeal(
        id: string,
        input: {
            name?: string
            mealType?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
            eatenAt?: string
            nutrients?: Record<string, number>
            favorite?: boolean
            nutritionQuality?: 'complete' | 'estimated' | 'incomplete'
            version: number
        },
    ) {
        const [record] = await this.database
            .update(meals)
            .set({
                name: input.name,
                mealType: input.mealType,
                eatenAt: input.eatenAt ? new Date(input.eatenAt) : undefined,
                nutrientSnapshot: input.nutrients,
                favorite: input.favorite,
                nutritionQuality: input.nutritionQuality,
                version: input.version + 1,
                updatedAt: new Date(),
            })
            .where(and(eq(meals.id, id), eq(meals.version, input.version), isNull(meals.deletedAt)))
            .returning()
        return record ?? null
    }

    async removeMeal(id: string) {
        const removed = await this.database
            .update(meals)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(meals.id, id), isNull(meals.deletedAt)))
            .returning({ id: meals.id })
        return removed.length > 0
    }

    async getPreferences() {
        const [record] = await this.database.select().from(preferences).limit(1)
        if (record) return record
        const [created] = await this.database
            .insert(preferences)
            .values({ id: 'owner' })
            .returning()
        return created
    }

    async updatePreferences(input: {
        displayName?: string
        timezone?: string
        locale?: string
        units?: 'metric' | 'imperial'
        metricPreferences?: MetricPreferences
        goals?: Record<string, number>
        mcpEnabled?: boolean
        experience?: Record<string, unknown>
    }) {
        const current = await this.getPreferences()
        const [record] = await this.database
            .insert(preferences)
            .values({ id: 'owner', ...input })
            .onConflictDoUpdate({
                target: preferences.id,
                set: { ...input, updatedAt: new Date() },
            })
            .returning()
        return record ?? current
    }

    async listFoods(query?: string) {
        const records = await this.database
            .select()
            .from(foods)
            .orderBy(
                desc(foods.favorite),
                sql`${foods.lastUsedAt} desc nulls last`,
                desc(foods.updatedAt),
            )
        const normalizedQuery = query ? normalizeFoodSearch(query) : ''
        if (!normalizedQuery) return records
        return records
            .map((food, index) => ({
                food,
                index,
                score: foodMatchScore(normalizedQuery, food.name, food.brand),
            }))
            .filter(match => Number.isFinite(match.score))
            .sort((left, right) => left.score - right.score || left.index - right.index)
            .map(match => match.food)
    }

    async createFood(input: typeof foods.$inferInsert) {
        const [record] = await this.database.insert(foods).values(input).returning()
        return record
    }

    async updateFood(id: string, input: Partial<typeof foods.$inferInsert> & { version: number }) {
        const { version, ...changes } = input
        const [record] = await this.database
            .update(foods)
            .set({ ...changes, version: version + 1, updatedAt: new Date() })
            .where(and(eq(foods.id, id), eq(foods.version, version)))
            .returning()
        return record ?? null
    }

    async importFoods(input: {
        duplicateStrategy: 'skip' | 'update' | 'create'
        foods: Array<typeof foods.$inferInsert>
    }) {
        const results: Array<{
            index: number
            status: 'created' | 'updated' | 'skipped' | 'failed'
            id?: string
            reason?: string
        }> = []
        for (const [index, candidate] of input.foods.entries()) {
            try {
                const [existing] = await this.database
                    .select()
                    .from(foods)
                    .where(
                        candidate.barcode
                            ? eq(foods.barcode, candidate.barcode)
                            : and(
                                  sql`lower(${foods.name}) = lower(${candidate.name})`,
                                  candidate.brand
                                      ? sql`lower(coalesce(${foods.brand}, '')) = lower(${candidate.brand})`
                                      : sql`${foods.brand} is null`,
                              ),
                    )
                    .limit(1)
                if (existing && input.duplicateStrategy === 'skip') {
                    results.push({ index, status: 'skipped', id: existing.id, reason: 'duplicate' })
                    continue
                }
                if (existing && input.duplicateStrategy === 'update') {
                    const [updated] = await this.database
                        .update(foods)
                        .set({ ...candidate, version: existing.version + 1, updatedAt: new Date() })
                        .where(eq(foods.id, existing.id))
                        .returning({ id: foods.id })
                    results.push({ index, status: 'updated', id: updated.id })
                    continue
                }
                const [created] = await this.database
                    .insert(foods)
                    .values(candidate)
                    .returning({ id: foods.id })
                results.push({ index, status: 'created', id: created.id })
            } catch (error) {
                results.push({
                    index,
                    status: 'failed',
                    reason: error instanceof Error ? error.message : 'database_error',
                })
            }
        }
        return {
            results,
            created: results.filter(result => result.status === 'created').length,
            updated: results.filter(result => result.status === 'updated').length,
            skipped: results.filter(result => result.status === 'skipped').length,
            failed: results.filter(result => result.status === 'failed').length,
        }
    }

    async listRecipes() {
        const records = await this.database
            .select()
            .from(recipes)
            .orderBy(desc(recipes.favorite), desc(recipes.updatedAt))
        return Promise.all(
            records.map(async recipe => {
                const items = await this.database
                    .select({ item: recipeItems, food: foods })
                    .from(recipeItems)
                    .innerJoin(foods, eq(recipeItems.foodId, foods.id))
                    .where(eq(recipeItems.recipeId, recipe.id))
                const total = items.reduce(
                    (nutrients, { item, food }) => {
                        const factor = item.grams / 100 / recipe.servings
                        const add = (key: keyof typeof nutrients, value: number | null) => {
                            nutrients[key] =
                                nutrients[key] === null || value === null
                                    ? null
                                    : nutrients[key] + value * factor
                        }
                        add('calories', food.caloriesPer100g)
                        add('protein', food.proteinPer100g)
                        add('carbs', food.carbsPer100g)
                        add('fat', food.fatPer100g)
                        add('fiber', food.fiberPer100g)
                        add('sugar', food.sugarPer100g)
                        add('saturatedFat', food.saturatedFatPer100g)
                        add('sodium', food.sodiumPer100g)
                        add('potassium', food.potassiumPer100g)
                        return nutrients
                    },
                    {
                        calories: 0,
                        protein: 0,
                        carbs: 0,
                        fat: 0,
                        fiber: 0,
                        sugar: 0,
                        saturatedFat: 0,
                        sodium: 0,
                        potassium: 0,
                    } as Record<
                        | 'calories'
                        | 'protein'
                        | 'carbs'
                        | 'fat'
                        | 'fiber'
                        | 'sugar'
                        | 'saturatedFat'
                        | 'sodium'
                        | 'potassium',
                        number | null
                    >,
                )
                return {
                    ...recipe,
                    items: items.map(({ item, food }) => ({ ...item, foodName: food.name })),
                    nutrientsPerServing: total,
                    nutritionQuality: items.some(
                        ({ food }) => food.nutritionQuality === 'incomplete',
                    )
                        ? 'incomplete'
                        : items.some(({ food }) => food.nutritionQuality === 'estimated')
                          ? 'estimated'
                          : 'complete',
                }
            }),
        )
    }

    async createRecipe(input: {
        name: string
        servings: number
        favorite: boolean
        items: { foodId: string; grams: number }[]
    }) {
        return this.database.transaction(async transaction => {
            const [recipe] = await transaction
                .insert(recipes)
                .values({ name: input.name, servings: input.servings, favorite: input.favorite })
                .returning()
            const items = await transaction
                .insert(recipeItems)
                .values(input.items.map(item => ({ recipeId: recipe.id, ...item })))
                .returning()
            return { ...recipe, items }
        })
    }

    async updateRecipe(id: string, input: { servings: number; version: number }) {
        const [record] = await this.database
            .update(recipes)
            .set({
                servings: input.servings,
                version: input.version + 1,
                updatedAt: new Date(),
            })
            .where(and(eq(recipes.id, id), eq(recipes.version, input.version)))
            .returning()
        return record ?? null
    }

    listGoals() {
        return this.database.select().from(goals).orderBy(desc(goals.effectiveFrom))
    }

    async createGoal(input: {
        metricId: string
        aggregation: 'latest' | 'average' | 'total'
        comparator: 'gte' | 'lte' | 'between'
        target: { value: number } | { min: number; max: number }
        period: { type: 'day' | 'week' } | { type: 'rolling'; days: 7 | 14 | 30 }
        canonicalUnit: string
        effectiveFrom: string
        effectiveTo?: string | null
        schedule: { weekdays?: number[] }
    }) {
        const [record] = await this.database
            .insert(goals)
            .values({
                ...input,
                legacyTargetValue: 'value' in input.target ? input.target.value : input.target.min,
                effectiveFrom: new Date(input.effectiveFrom),
                effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
            })
            .returning()
        return record
    }

    async retireGoal(id: string, effectiveTo: string) {
        const [record] = await this.database
            .update(goals)
            .set({ effectiveTo: new Date(effectiveTo) })
            .where(eq(goals.id, id))
            .returning()
        return record ?? null
    }

    async updateGoal(
        id: string,
        input: {
            metricId?: string
            aggregation?: 'latest' | 'average' | 'total'
            comparator?: 'gte' | 'lte' | 'between'
            target?: { value: number } | { min: number; max: number }
            period?: { type: 'day' | 'week' } | { type: 'rolling'; days: 7 | 14 | 30 }
            canonicalUnit?: string
            effectiveFrom?: string
            effectiveTo?: string | null
            schedule?: { weekdays?: number[] }
        },
    ) {
        const [record] = await this.database
            .update(goals)
            .set({
                ...input,
                legacyTargetValue: input.target
                    ? 'value' in input.target
                        ? input.target.value
                        : input.target.min
                    : undefined,
                effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
                effectiveTo:
                    input.effectiveTo === null
                        ? null
                        : input.effectiveTo
                          ? new Date(input.effectiveTo)
                          : undefined,
                updatedAt: new Date(),
            })
            .where(eq(goals.id, id))
            .returning()
        return record ?? null
    }

    async removeGoal(id: string) {
        const removed = await this.database
            .delete(goals)
            .where(and(eq(goals.id, id), lte(goals.effectiveTo, new Date())))
            .returning({ id: goals.id })
        return removed.length > 0
    }

    listSavedTrendViews() {
        return this.database.select().from(savedTrendViews).orderBy(desc(savedTrendViews.createdAt))
    }

    async createSavedTrendView(input: {
        name: string
        metric: string
        comparisonMetric?: string
        rangeDays: number
        granularity: 'daily' | 'weekly'
    }) {
        const [record] = await this.database.insert(savedTrendViews).values(input).returning()
        return record
    }
}
