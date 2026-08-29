import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { PostgresDataRepository } from '../data/postgres-repository.js'
import { DataDeletionService } from './deletion.js'

describe('explicit data deletion', () => {
    it('deletes observation categories without a second Journal entity store', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const mealId = '00000000-0000-4000-8000-000000000001'
        const observationId = '00000000-0000-4000-8000-000000000002'
        const journalId = '00000000-0000-4000-8000-000000000003'
        await database.insert(schema.observations).values([
            {
                id: mealId,
                definitionId: 'meal',
                valueType: 'compound',
                title: 'Private meal',
                category: 'Meals',
                observedAt: new Date(),
            },
            {
                id: observationId,
                definitionId: 'weight',
                canonicalValue: 80,
                canonicalUnit: 'kg',
                originalValue: 80,
                originalUnit: 'kg',
                observedAt: new Date(),
            },
            {
                id: journalId,
                definitionId: 'event',
                valueType: 'text',
                textValue: 'A private note',
                title: 'A private note',
                category: 'Check-ins',
                observedAt: new Date(),
            },
        ])

        const deletion = new DataDeletionService(database as never)
        await deletion.deleteCategory('meals')
        expect(
            (await database.select().from(schema.observations)).map(row => row.id).sort(),
        ).toEqual([observationId, journalId].sort())
        await deletion.deleteCategory('checkins')
        expect((await database.select().from(schema.observations)).map(row => row.id)).toEqual([
            observationId,
        ])
        await deletion.deleteCategory('observations')
        expect(await database.select().from(schema.observations)).toHaveLength(0)
        expect(await database.select().from(schema.auditEvents)).toHaveLength(3)
        await client.close()
    })

    it('marks meal projections dirty and removes deleted nutrients on the next read', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const repository = new PostgresDataRepository(database as never)
        await repository.createMeal({
            name: 'Retained in projection',
            mealType: 'Dinner',
            eatenAt: '2026-08-25T18:00:00Z',
            nutrients: { calories: 800 },
            favorite: false,
            nutritionQuality: 'complete',
        })
        expect(
            (await repository.listDailyMetrics({ from: '2026-08-25', to: '2026-08-25' })).some(
                row => row.definitionId === 'calories',
            ),
        ).toBe(true)

        const deletion = new DataDeletionService(database as never)
        await deletion.deleteCategory('meals')
        expect(await database.select().from(schema.projectionDirtyDates)).toHaveLength(1)
        expect(
            (await repository.listDailyMetrics({ from: '2026-08-25', to: '2026-08-25' })).some(
                row => row.definitionId === 'calories',
            ),
        ).toBe(false)
        expect(await database.select().from(schema.projectionDirtyDates)).toHaveLength(0)
        await client.close()
    })
})
