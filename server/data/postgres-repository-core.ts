import { randomUUID } from 'node:crypto'
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    foods,
    healthRecords,
    goals,
    observations,
    observationRelations,
    preferences,
    sources,
    recipeItems,
    recipes,
    savedTrendViews,
} from '../db/schema.js'
import type { RecordRange } from './types.js'
import { convertMetricValue, type MetricPreferences } from '@trackit/domain/metrics'
import { rebuildEffectiveDailyMetric } from './daily-projection.js'
import { dateKeyInTimezone } from './timezone.js'
import { getEffectiveMetricSeries } from './effective-series.js'
import { observationDefinition } from '@trackit/domain/observationDefinitions'

type Database = PostgresJsDatabase<typeof schemaType>

type MealAttributes = {
    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
    nutrientSnapshot: Record<string, number>
    nutritionQuality: 'complete' | 'estimated' | 'incomplete'
    favorite: boolean
    primaryDefinitionId: 'calories'
    serving?: { amount: number; unit: 'g' | 'serving' }
}

type MealSourceItem = {
    kind: 'food' | 'recipe'
    id: string
}

const mealSourceItem = (value: unknown): MealSourceItem | undefined => {
    if (!value || typeof value !== 'object') return undefined
    const metadata = value as Record<string, unknown>
    if (typeof metadata.foodId === 'string') return { kind: 'food', id: metadata.foodId }
    if (typeof metadata.recipeId === 'string') return { kind: 'recipe', id: metadata.recipeId }
    return undefined
}

const mealFromObservation = (
    record: typeof observations.$inferSelect,
    nutrientSnapshot?: Record<string, number>,
) => {
    const attributes = record.attributes as Partial<MealAttributes>
    return {
        id: record.id,
        name: record.title ?? 'Meal',
        mealType: attributes.mealType ?? 'Snack',
        eatenAt: record.observedAt,
        nutrientSnapshot: nutrientSnapshot ?? attributes.nutrientSnapshot ?? {},
        nutritionQuality: attributes.nutritionQuality ?? 'complete',
        favorite: attributes.favorite ?? false,
        serving: attributes.serving,
        sourceItem: mealSourceItem(record.metadata),
        sourceId: record.sourceId,
        version: Number(record.version),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        deletedAt: record.deletedAt,
    }
}

const nutrientUnit = (metric: string) =>
    metric === 'calories' ? 'kcal' : ['sodium', 'potassium'].includes(metric) ? 'mg' : 'g'

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

export class PostgresDataRepository {
    private async projectionDate(observedAt: Date) {
        const [saved] = await this.database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        return dateKeyInTimezone(observedAt, saved?.timezone ?? 'UTC')
    }

    listHealthRecords() {
        return this.database.select().from(healthRecords).orderBy(desc(healthRecords.startTime))
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
            .selectDistinct({ definitionId: observations.definitionId, provider, connector })
            .from(observations)
            .where(isNull(observations.deletedAt))
            .orderBy(observations.definitionId, provider, connector)
    }

    constructor(private readonly database: Database) {}

    private observationQuery(range: RecordRange = {}) {
        const conditions = [isNull(observations.deletedAt)]
        if (range.from) conditions.push(gte(observations.observedAt, new Date(range.from)))
        if (range.to) conditions.push(lt(observations.observedAt, new Date(range.to)))
        return this.database
            .select()
            .from(observations)
            .where(and(...conditions))
            .orderBy(desc(observations.observedAt))
    }

    listRawObservations(range: RecordRange = {}) {
        return this.observationQuery(range)
    }

    async listObservations(range: RecordRange = {}) {
        return getEffectiveMetricSeries(this.database, range)
    }

    async createObservation(input: {
        id?: string
        definitionId: string
        valueType?: 'number' | 'text' | 'boolean' | 'category' | 'event'
        value?: number
        unit?: string
        textValue?: string
        booleanValue?: boolean
        categoryValue?: string
        title?: string
        category?: 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'
        attributes?: Record<string, unknown>
        observedAt: string
        source: string
    }) {
        const definition = observationDefinition(input.definitionId)
        const valueType = input.valueType ?? 'number'
        if (!definition) throw new Error(`Unknown observation definition: ${input.definitionId}`)
        if (definition.valueType !== valueType)
            throw new Error(`${input.definitionId} observations require ${definition.valueType}`)
        if (
            valueType === 'number' &&
            input.value !== undefined &&
            definition.metric?.validRange &&
            (input.value < definition.metric.validRange.min ||
                input.value > definition.metric.validRange.max)
        )
            throw new Error(
                `${input.definitionId} must be between ${definition.metric.validRange.min} and ${definition.metric.validRange.max}`,
            )
        const canonicalValue =
            valueType === 'number' && input.value !== undefined && input.unit && definition.metric
                ? convertMetricValue(
                      input.definitionId,
                      input.value,
                      input.unit,
                      definition.metric.canonicalUnit,
                  )
                : input.value
        const canonicalUnit = definition.metric?.canonicalUnit ?? input.unit
        const [record] = await this.database
            .insert(observations)
            .values({
                id: input.id,
                definitionId: input.definitionId,
                valueType,
                origin: 'manual',
                canonicalValue,
                canonicalUnit,
                originalValue: input.value,
                originalUnit: input.unit,
                textValue: input.textValue,
                booleanValue: input.booleanValue,
                categoryValue: input.categoryValue,
                title: input.title,
                category: input.category,
                observedAt: new Date(input.observedAt),
                metadata: { source: input.source },
                attributes: input.attributes ?? {},
            })
            .onConflictDoNothing({ target: observations.id })
            .returning()
        if (record) {
            await rebuildEffectiveDailyMetric(
                this.database,
                await this.projectionDate(record.observedAt),
            )
            return record
        }
        const [existing] = await this.database
            .select()
            .from(observations)
            .where(eq(observations.id, input.id!))
        return existing
    }

    async updateObservation(
        id: string,
        input: {
            excluded?: boolean
            title?: string
            textValue?: string
            detail?: string
            observedAt?: string
            version: number
        },
    ) {
        const [before] = await this.database
            .select({
                observedAt: observations.observedAt,
                valueType: observations.valueType,
                attributes: observations.attributes,
            })
            .from(observations)
            .where(eq(observations.id, id))
        const [record] = await this.database
            .update(observations)
            .set({
                excluded: input.excluded,
                title: input.title,
                textValue: input.textValue,
                attributes:
                    input.detail === undefined
                        ? undefined
                        : {
                              ...(before?.attributes as Record<string, unknown> | undefined),
                              description: input.detail,
                          },
                observedAt: input.observedAt ? new Date(input.observedAt) : undefined,
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
        if (record && record.valueType === 'number') {
            await rebuildEffectiveDailyMetric(
                this.database,
                await this.projectionDate(record.observedAt),
            )
            if (before && before.observedAt.getTime() !== record.observedAt.getTime())
                await rebuildEffectiveDailyMetric(
                    this.database,
                    await this.projectionDate(before.observedAt),
                )
        }
        return record ?? null
    }

    async removeObservation(id: string) {
        const removed = await this.database
            .update(observations)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(observations.id, id), isNull(observations.deletedAt)))
            .returning({ id: observations.id, observedAt: observations.observedAt })
        if (removed[0])
            await rebuildEffectiveDailyMetric(
                this.database,
                await this.projectionDate(removed[0].observedAt),
            )
        return removed.length > 0
    }

    async listMeals(range: RecordRange = {}) {
        const conditions = [
            isNull(observations.deletedAt),
            eq(observations.definitionId, 'meal'),
            eq(observations.valueType, 'compound'),
        ]
        if (range.from) conditions.push(gte(observations.observedAt, new Date(range.from)))
        if (range.to) conditions.push(lt(observations.observedAt, new Date(range.to)))
        const records = await this.database
            .select()
            .from(observations)
            .where(and(...conditions))
            .orderBy(desc(observations.observedAt))
        if (!records.length) return []
        const components = await this.database
            .select({
                parentId: observationRelations.parentObservationId,
                definitionId: observations.definitionId,
                value: observations.canonicalValue,
            })
            .from(observationRelations)
            .innerJoin(observations, eq(observationRelations.childObservationId, observations.id))
            .where(
                and(
                    inArray(
                        observationRelations.parentObservationId,
                        records.map(record => record.id),
                    ),
                    eq(observationRelations.kind, 'component'),
                    isNull(observations.deletedAt),
                ),
            )
        const nutrients = new Map<string, Record<string, number>>()
        for (const component of components) {
            if (component.value === null) continue
            const values = nutrients.get(component.parentId) ?? {}
            values[component.definitionId] = component.value
            nutrients.set(component.parentId, values)
        }
        return records.map(record => mealFromObservation(record, nutrients.get(record.id)))
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
        recipeId?: string
        serving?: { amount: number; unit: 'g' | 'serving' }
    }) {
        const projectionDate = await this.projectionDate(new Date(input.eatenAt))
        return this.database.transaction(async transaction => {
            const attributes: MealAttributes = {
                mealType: input.mealType,
                nutrientSnapshot: input.nutrients,
                favorite: input.favorite,
                nutritionQuality: input.nutritionQuality,
                primaryDefinitionId: 'calories',
                serving: input.serving,
            }
            const [root] = await transaction
                .insert(observations)
                .values({
                    id: input.id,
                    definitionId: 'meal',
                    valueType: 'compound',
                    origin: 'manual',
                    title: input.name,
                    category: 'Meals',
                    observedAt: new Date(input.eatenAt),
                    attributes,
                    metadata: input.foodId
                        ? { foodId: input.foodId }
                        : input.recipeId
                          ? { recipeId: input.recipeId }
                          : {},
                })
                .onConflictDoNothing({ target: observations.id })
                .returning()
            if (root) {
                const components = Object.entries(input.nutrients).map(
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
                            observedAt: new Date(input.eatenAt),
                            attributes: { nutritionQuality: input.nutritionQuality },
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
                if (input.foodId) {
                    await transaction
                        .update(foods)
                        .set({ lastUsedAt: new Date(input.eatenAt) })
                        .where(eq(foods.id, input.foodId))
                }
                await rebuildEffectiveDailyMetric(transaction, projectionDate)
                return mealFromObservation(root)
            }
            const [existing] = await transaction
                .select()
                .from(observations)
                .where(eq(observations.id, input.id!))
            return existing ? mealFromObservation(existing) : undefined
        })
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
            serving?: { amount: number; unit: 'g' | 'serving' } | null
            foodId?: string | null
            recipeId?: string | null
            version: number
        },
    ) {
        const [saved] = await this.database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const timezone = saved?.timezone ?? 'UTC'
        return this.database.transaction(async transaction => {
            const [before] = await transaction
                .select()
                .from(observations)
                .where(eq(observations.id, id))
            if (!before) return null
            const previous = before.attributes as Partial<MealAttributes>
            const attributes: MealAttributes = {
                mealType: input.mealType ?? previous.mealType ?? 'Snack',
                nutrientSnapshot: input.nutrients ?? previous.nutrientSnapshot ?? {},
                favorite: input.favorite ?? previous.favorite ?? false,
                nutritionQuality: input.nutritionQuality ?? previous.nutritionQuality ?? 'complete',
                primaryDefinitionId: 'calories',
                serving:
                    input.serving === undefined ? previous.serving : (input.serving ?? undefined),
            }
            const sourceChanged = input.foodId !== undefined || input.recipeId !== undefined
            const metadata = sourceChanged
                ? { ...(before.metadata as Record<string, unknown>) }
                : undefined
            if (metadata) {
                delete metadata.foodId
                delete metadata.recipeId
                if (input.foodId) metadata.foodId = input.foodId
                else if (input.recipeId) metadata.recipeId = input.recipeId
            }
            const [record] = await transaction
                .update(observations)
                .set({
                    title: input.name,
                    observedAt: input.eatenAt ? new Date(input.eatenAt) : undefined,
                    attributes,
                    metadata,
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
            if (record) {
                if (input.nutrients) {
                    const existingComponents = await transaction
                        .select({ id: observationRelations.childObservationId })
                        .from(observationRelations)
                        .where(
                            and(
                                eq(observationRelations.parentObservationId, id),
                                eq(observationRelations.kind, 'component'),
                            ),
                        )
                    if (existingComponents.length)
                        await transaction.delete(observations).where(
                            inArray(
                                observations.id,
                                existingComponents.map(item => item.id),
                            ),
                        )
                    const components = Object.entries(input.nutrients).map(
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
                                observedAt: record.observedAt,
                                attributes: { nutritionQuality: attributes.nutritionQuality },
                            })),
                        )
                        await transaction.insert(observationRelations).values(
                            components.map(component => ({
                                parentObservationId: id,
                                childObservationId: component.id,
                                kind: 'component',
                                role: component.metric,
                                ordinal: component.ordinal,
                            })),
                        )
                    }
                } else if (input.eatenAt) {
                    const components = await transaction
                        .select({ id: observationRelations.childObservationId })
                        .from(observationRelations)
                        .where(eq(observationRelations.parentObservationId, id))
                    if (components.length)
                        await transaction
                            .update(observations)
                            .set({ observedAt: record.observedAt, updatedAt: new Date() })
                            .where(
                                inArray(
                                    observations.id,
                                    components.map(item => item.id),
                                ),
                            )
                }
                if (input.foodId) {
                    await transaction
                        .update(foods)
                        .set({ lastUsedAt: record.observedAt })
                        .where(eq(foods.id, input.foodId))
                }
                const dates = new Set([
                    dateKeyInTimezone(record.observedAt, timezone),
                    dateKeyInTimezone(before.observedAt, timezone),
                ])
                for (const date of dates) await rebuildEffectiveDailyMetric(transaction, date)
            }
            return record ? mealFromObservation(record) : null
        })
    }

    async removeMeal(id: string) {
        const [saved] = await this.database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const timezone = saved?.timezone ?? 'UTC'
        return this.database.transaction(async transaction => {
            const [root] = await transaction
                .update(observations)
                .set({ deletedAt: new Date(), updatedAt: new Date() })
                .where(and(eq(observations.id, id), isNull(observations.deletedAt)))
                .returning({ id: observations.id, eatenAt: observations.observedAt })
            if (root) {
                const components = await transaction
                    .select({ id: observationRelations.childObservationId })
                    .from(observationRelations)
                    .where(eq(observationRelations.parentObservationId, id))
                if (components.length)
                    await transaction
                        .update(observations)
                        .set({ deletedAt: new Date(), updatedAt: new Date() })
                        .where(
                            inArray(
                                observations.id,
                                components.map(item => item.id),
                            ),
                        )
                await rebuildEffectiveDailyMetric(
                    transaction,
                    dateKeyInTimezone(root.eatenAt, timezone),
                )
            }
            return Boolean(root)
        })
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
        metricPreferences?: MetricPreferences
        mcpEnabled?: boolean
        experience?: Record<string, unknown>
    }) {
        const current = (await this.getPreferences()) as typeof preferences.$inferSelect
        const resolutionSettings = (value: MetricPreferences | null | undefined) =>
            Object.fromEntries(
                Object.entries(value ?? {})
                    .filter(([, preference]) => preference.deduplication)
                    .sort(([left], [right]) => left.localeCompare(right))
                    .map(([metric, preference]) => [metric, preference.deduplication]),
            )
        const resolutionChanged =
            (input.timezone !== undefined && input.timezone !== current.timezone) ||
            (input.metricPreferences !== undefined &&
                JSON.stringify(resolutionSettings(input.metricPreferences)) !==
                    JSON.stringify(
                        resolutionSettings(
                            current.metricPreferences as MetricPreferences | null | undefined,
                        ),
                    ))
        const [record] = await this.database
            .insert(preferences)
            .values({
                id: 'owner',
                ...input,
                metricResolutionVersion: resolutionChanged
                    ? current.metricResolutionVersion + 1
                    : current.metricResolutionVersion,
            })
            .onConflictDoUpdate({
                target: preferences.id,
                set: {
                    ...input,
                    metricResolutionVersion: resolutionChanged
                        ? current.metricResolutionVersion + 1
                        : current.metricResolutionVersion,
                    updatedAt: new Date(),
                },
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
        definitionId: string
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
            definitionId?: string
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
        definitionId: string
        comparisonDefinitionId?: string
        rangeDays: number
        granularity: 'daily' | 'weekly'
    }) {
        const [record] = await this.database.insert(savedTrendViews).values(input).returning()
        return record
    }
}
