import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { DataLifecycleService } from './service.js'

describe('data lifecycle', () => {
    it('deletes linked journal representations with selected health categories', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const mealId = '00000000-0000-4000-8000-000000000001'
        const observationId = '00000000-0000-4000-8000-000000000002'
        await database.insert(schema.meals).values({
            id: mealId,
            name: 'Private meal',
            mealType: 'Dinner',
            eatenAt: new Date(),
        })
        await database.insert(schema.observations).values({
            id: observationId,
            metric: 'weight',
            canonicalValue: 80,
            canonicalUnit: 'kg',
            originalValue: 80,
            originalUnit: 'kg',
            observedAt: new Date(),
        })
        await database.insert(schema.journalEntries).values([
            {
                category: 'Meals',
                title: 'Private meal',
                sourceLabel: 'You',
                observedAt: new Date(),
                entityType: 'meal',
                entityId: mealId,
            },
            {
                category: 'Measurements',
                title: '80 kg',
                sourceLabel: 'You',
                observedAt: new Date(),
                entityType: 'observation',
                entityId: observationId,
            },
        ])

        const lifecycle = new DataLifecycleService(database as never)
        await lifecycle.deleteCategory('meals')
        expect(await database.select().from(schema.meals)).toHaveLength(0)
        expect(await database.select().from(schema.journalEntries)).toEqual([
            expect.objectContaining({ entityId: observationId }),
        ])

        await lifecycle.deleteCategory('observations')
        expect(await database.select().from(schema.observations)).toHaveLength(0)
        expect(await database.select().from(schema.journalEntries)).toHaveLength(0)
        expect(await database.select().from(schema.auditEvents)).toHaveLength(2)

        const retainedMealId = '00000000-0000-4000-8000-000000000003'
        await database.insert(schema.meals).values({
            id: retainedMealId,
            name: 'Expired private meal',
            mealType: 'Dinner',
            eatenAt: new Date('2020-01-01T12:00:00Z'),
        })
        await database.insert(schema.journalEntries).values({
            category: 'Meals',
            title: 'Expired private meal',
            sourceLabel: 'You',
            observedAt: new Date('2020-01-01T12:00:00Z'),
            entityType: 'meal',
            entityId: retainedMealId,
        })
        await lifecycle.setRetentionRule('meals', 1, true)
        await lifecycle.applyRetention()
        expect(await database.select().from(schema.meals)).toHaveLength(0)
        expect(await database.select().from(schema.journalEntries)).toHaveLength(0)
        await client.close()
    })
})
