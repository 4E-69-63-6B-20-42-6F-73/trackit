import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { planItems, plannedMeals } from '../planning/schema.js'
import { registerFoodLibraryRoutes } from './food-library.js'

describe('food library deletion', () => {
    it('deletes unreferenced foods and blocks foods that recipes or meal plans still use', async () => {
        const databaseClient = new PGlite()
        await applyTestMigrations(databaseClient)
        const database = drizzle(databaseClient, { schema })
        const app = Fastify()
        registerFoodLibraryRoutes(app, database as never)

        const [deletable] = await database
            .insert(schema.foods)
            .values({ name: 'Plain Skyr' })
            .returning()
        const [inUse] = await database
            .insert(schema.foods)
            .values({ name: 'Rolled oats' })
            .returning()
        const [planned] = await database
            .insert(schema.foods)
            .values({ name: 'Banana' })
            .returning()
        const [recipe] = await database
            .insert(schema.recipes)
            .values({ name: 'Overnight oats' })
            .returning()
        await database.insert(schema.recipeItems).values({
            recipeId: recipe.id,
            foodId: inUse.id,
            grams: 80,
        })
        const [plan] = await database
            .insert(planItems)
            .values({ kind: 'meal', scheduledDate: '2026-09-02' })
            .returning()
        await database.insert(plannedMeals).values({
            planItemId: plan.id,
            mealType: 'Snack',
            referenceType: 'food',
            foodId: planned.id,
            amount: 120,
            unit: 'g',
        })

        const stale = await app.inject({
            method: 'DELETE',
            url: `/api/foods/${deletable.id}`,
            payload: { version: deletable.version + 1 },
        })
        expect(stale.statusCode).toBe(409)
        expect(stale.json()).toEqual({ error: 'version_conflict' })

        const blocked = await app.inject({
            method: 'DELETE',
            url: `/api/foods/${inUse.id}`,
            payload: { version: inUse.version },
        })
        expect(blocked.statusCode).toBe(409)
        expect(blocked.json()).toEqual({
            error: 'food_in_use',
            recipes: [{ id: recipe.id, name: 'Overnight oats' }],
            plannedMeals: 0,
        })

        const planBlocked = await app.inject({
            method: 'DELETE',
            url: `/api/foods/${planned.id}`,
            payload: { version: planned.version },
        })
        expect(planBlocked.statusCode).toBe(409)
        expect(planBlocked.json()).toEqual({
            error: 'food_in_use',
            recipes: [],
            plannedMeals: 1,
        })

        const removed = await app.inject({
            method: 'DELETE',
            url: `/api/foods/${deletable.id}`,
            payload: { version: deletable.version },
        })
        expect(removed.statusCode).toBe(204)
        expect(
            await database.select().from(schema.foods).where(eq(schema.foods.id, deletable.id)),
        ).toEqual([])
        expect(
            await database.select().from(schema.foods).where(eq(schema.foods.id, inUse.id)),
        ).toHaveLength(1)
        expect(
            await database.select().from(schema.foods).where(eq(schema.foods.id, planned.id)),
        ).toHaveLength(1)

        await app.close()
        await databaseClient.close()
    })
})
