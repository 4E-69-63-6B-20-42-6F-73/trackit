import { and, desc, eq, gte, ilike, isNull, lte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    foods,
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

type Database = PostgresJsDatabase<typeof schemaType>

export class PostgresDataRepository implements DataRepository {
    listSources() {
        return this.database.select().from(sources).orderBy(sources.name)
    }

    constructor(private readonly database: Database) {}

    listObservations(range: RecordRange = {}) {
        const conditions = [isNull(observations.deletedAt)]
        if (range.from) conditions.push(gte(observations.observedAt, new Date(range.from)))
        if (range.to) conditions.push(lte(observations.observedAt, new Date(range.to)))
        return this.database
            .select()
            .from(observations)
            .where(and(...conditions))
            .orderBy(desc(observations.observedAt))
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

    listFoods(query?: string) {
        const select = this.database.select().from(foods)
        return query
            ? select
                  .where(ilike(foods.name, `%${query}%`))
                  .orderBy(
                      sql`case when lower(${foods.name}) = lower(${query}) then 0 else 1 end`,
                      desc(foods.favorite),
                      sql`${foods.lastUsedAt} desc nulls last`,
                      desc(foods.updatedAt),
                  )
            : select.orderBy(
                  desc(foods.favorite),
                  sql`${foods.lastUsedAt} desc nulls last`,
                  desc(foods.updatedAt),
              )
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
                        nutrients.calories += food.caloriesPer100g * factor
                        nutrients.protein += food.proteinPer100g * factor
                        nutrients.carbs += food.carbsPer100g * factor
                        nutrients.fat += food.fatPer100g * factor
                        nutrients.fiber += food.fiberPer100g * factor
                        nutrients.sugar += food.sugarPer100g * factor
                        nutrients.saturatedFat += food.saturatedFatPer100g * factor
                        nutrients.sodium += food.sodiumPer100g * factor
                        nutrients.potassium += food.potassiumPer100g * factor
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
                    },
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
        metric: string
        targetValue: number
        canonicalUnit: string
        effectiveFrom: string
        effectiveTo?: string
        schedule: Record<string, unknown>
    }) {
        const [record] = await this.database
            .insert(goals)
            .values({
                ...input,
                effectiveFrom: new Date(input.effectiveFrom),
                effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
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
