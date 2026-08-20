import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { DataLifecycleService } from './service.js'

const migrations = [
    '0000_handy_rattler.sql',
    '0001_noisy_leo.sql',
    '0002_mute_drax.sql',
    '0003_chief_lord_tyger.sql',
    '0004_strange_mephistopheles.sql',
    '0005_warm_mongoose.sql',
    '0006_mighty_micromacro.sql',
    '0007_huge_mandarin.sql',
    '0008_public_mephistopheles.sql',
    '0009_nappy_alex_power.sql',
    '0010_nice_masked_marvel.sql',
    '0011_powerful_elektra.sql',
    '0012_hesitant_swordsman.sql',
    '0013_stale_the_stranger.sql',
    '0014_marvelous_sleeper.sql',
    '0015_harsh_quasimodo.sql',
    '0016_wooden_steve_rogers.sql',
    '0017_narrow_ben_parker.sql',
]

describe('data lifecycle', () => {
    it('deletes linked journal representations with selected health categories', async () => {
        const client = new PGlite()
        for (const file of migrations) {
            const migration = await readFile(`server/db/migrations/${file}`, 'utf8')
            await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
        }
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
                id: mealId,
                category: 'Meals',
                title: 'Private meal',
                sourceLabel: 'You',
                observedAt: new Date(),
            },
            {
                id: observationId,
                category: 'Measurements',
                title: '80 kg',
                sourceLabel: 'You',
                observedAt: new Date(),
            },
        ])

        const lifecycle = new DataLifecycleService(database as never)
        await lifecycle.deleteCategory('meals')
        expect(await database.select().from(schema.meals)).toHaveLength(0)
        expect(await database.select().from(schema.journalEntries)).toEqual([
            expect.objectContaining({ id: observationId }),
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
            id: retainedMealId,
            category: 'Meals',
            title: 'Expired private meal',
            sourceLabel: 'You',
            observedAt: new Date('2020-01-01T12:00:00Z'),
        })
        await lifecycle.setRetentionRule('meals', 1, true)
        await lifecycle.applyRetention()
        expect(await database.select().from(schema.meals)).toHaveLength(0)
        expect(await database.select().from(schema.journalEntries)).toHaveLength(0)
        await client.close()
    })
})
