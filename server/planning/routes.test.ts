import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { foodCategories, foodCategoryMemberships } from '../nutrition/schema.js'
import { planItems } from './schema.js'
import { registerPlanRoutes } from './routes.js'

describe('meal planning routes', () => {
    it('keeps planned meals out of observations until they are logged', async () => {
        const databaseClient = new PGlite()
        await applyTestMigrations(databaseClient)
        const database = drizzle(databaseClient, { schema })
        const app = Fastify()
        registerPlanRoutes(app, database as never)

        const [food] = await database
            .insert(schema.foods)
            .values({
                name: 'Plain Skyr',
                caloriesPer100g: 62,
                proteinPer100g: 11,
                carbsPer100g: 4,
                fatPer100g: 0.2,
                fiberPer100g: 0,
                servingGrams: 200,
            })
            .returning()

        const created = await app.inject({
            method: 'POST',
            url: '/api/plan-items',
            payload: {
                scheduledDate: '2026-09-02',
                scheduledTime: '08:00',
                mealType: 'Breakfast',
                reference: { type: 'food', id: food.id },
                amount: 200,
            },
        })
        expect(created.statusCode).toBe(201)
        const plan = created.json().data
        expect(plan.scheduledTime).toBe('08:00')
        expect(plan.resultObservationId).toBeNull()
        expect(
            await database
                .select()
                .from(schema.observations)
                .where(eq(schema.observations.definitionId, 'meal')),
        ).toHaveLength(0)

        const logged = await app.inject({
            method: 'POST',
            url: `/api/plan-items/${plan.id}/log`,
            payload: {
                version: plan.version,
                eatenAt: '2026-09-02T07:30:00.000Z',
                amount: 180,
            },
        })
        expect(logged.statusCode).toBe(201)
        const observationId = logged.json().data.observationId
        const meals = await database
            .select()
            .from(schema.observations)
            .where(eq(schema.observations.definitionId, 'meal'))
        expect(meals).toHaveLength(1)
        expect(meals[0].id).toBe(observationId)

        const refreshed = await app.inject({
            method: 'GET',
            url: '/api/plan-items?from=2026-09-02&to=2026-09-02',
        })
        expect(refreshed.statusCode).toBe(200)
        expect(refreshed.json().data[0].resultObservationId).toBe(observationId)
        expect(await database.select().from(planItems)).toHaveLength(1)

        await app.close()
        await databaseClient.close()
    })

    it('can skip and restore a plan without creating health facts', async () => {
        const databaseClient = new PGlite()
        await applyTestMigrations(databaseClient)
        const database = drizzle(databaseClient, { schema })
        const app = Fastify()
        registerPlanRoutes(app, database as never)

        const [food] = await database.insert(schema.foods).values({ name: 'Banana' }).returning()
        const created = await app.inject({
            method: 'POST',
            url: '/api/plan-items',
            payload: {
                scheduledDate: '2026-09-03',
                mealType: 'Snack',
                reference: { type: 'food', id: food.id },
                amount: 120,
            },
        })
        const plan = created.json().data

        const skipped = await app.inject({
            method: 'POST',
            url: `/api/plan-items/${plan.id}/skip`,
            payload: { version: plan.version, skipped: true },
        })
        expect(skipped.statusCode).toBe(200)
        expect(skipped.json().data.skippedAt).not.toBeNull()

        const restored = await app.inject({
            method: 'POST',
            url: `/api/plan-items/${plan.id}/skip`,
            payload: { version: skipped.json().data.version, skipped: false },
        })
        expect(restored.statusCode).toBe(200)
        expect(restored.json().data.skippedAt).toBeNull()
        expect(
            await database
                .select()
                .from(schema.observations)
                .where(eq(schema.observations.definitionId, 'meal')),
        ).toHaveLength(0)

        await app.close()
        await databaseClient.close()
    })

    it('accumulates foods toward a flexible food group target', async () => {
        const databaseClient = new PGlite()
        await applyTestMigrations(databaseClient)
        const database = drizzle(databaseClient, { schema })
        const app = Fastify()
        registerPlanRoutes(app, database as never)

        await database
            .insert(foodCategories)
            .values({ id: 'fruit', name: 'Fruit', sortOrder: 10 })
            .onConflictDoNothing()
        const [apple, berries] = await database
            .insert(schema.foods)
            .values([
                { name: 'Apple', caloriesPer100g: 52 },
                { name: 'Blueberries', caloriesPer100g: 57 },
            ])
            .returning()
        await database.insert(foodCategoryMemberships).values([
            { foodId: apple.id, categoryId: 'fruit' },
            { foodId: berries.id, categoryId: 'fruit' },
        ])

        const created = await app.inject({
            method: 'POST',
            url: '/api/plan-items',
            payload: {
                scheduledDate: '2026-09-04',
                scheduledTime: '15:30',
                mealType: 'Snack',
                reference: { type: 'category', id: 'fruit' },
                amount: 200,
            },
        })
        expect(created.statusCode).toBe(201)
        expect(created.json().data).toMatchObject({
            scheduledTime: '15:30',
            meal: {
                reference: { type: 'category', id: 'fruit', name: 'Fruit' },
                amount: 200,
                fulfilledAmount: 0,
            },
        })

        const first = created.json().data
        const firstLog = await app.inject({
            method: 'POST',
            url: `/api/plan-items/${first.id}/log`,
            payload: {
                version: first.version,
                eatenAt: '2026-09-04T15:25:00.000Z',
                amount: 120,
                foodId: apple.id,
            },
        })
        expect(firstLog.statusCode).toBe(201)
        expect(firstLog.json().data.fulfilledAmount).toBe(120)

        const afterFirst = await app.inject({
            method: 'GET',
            url: '/api/plan-items?from=2026-09-04&to=2026-09-04',
        })
        const partial = afterFirst.json().data[0]
        expect(partial.resultObservationId).toBeNull()
        expect(partial.meal.fulfilledAmount).toBe(120)

        const secondLog = await app.inject({
            method: 'POST',
            url: `/api/plan-items/${partial.id}/log`,
            payload: {
                version: partial.version,
                eatenAt: '2026-09-04T16:00:00.000Z',
                amount: 90,
                foodId: berries.id,
            },
        })
        expect(secondLog.statusCode).toBe(201)
        expect(secondLog.json().data.fulfilledAmount).toBe(210)

        const complete = await app.inject({
            method: 'GET',
            url: '/api/plan-items?from=2026-09-04&to=2026-09-04',
        })
        expect(complete.json().data[0].meal.fulfilledAmount).toBe(210)
        expect(
            await database
                .select()
                .from(schema.observations)
                .where(eq(schema.observations.definitionId, 'meal')),
        ).toHaveLength(2)

        await app.close()
        await databaseClient.close()
    })
})
