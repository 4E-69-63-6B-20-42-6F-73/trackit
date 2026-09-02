import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { DailyProjectionCoordinator } from './projection-coordinator.js'

async function migratedDatabase() {
    const client = new PGlite()
    for (const filename of (await readdir('server/db/migrations'))
        .filter(name => name.endsWith('.sql'))
        .sort()) {
        const migration = await readFile(`server/db/migrations/${filename}`, 'utf8')
        await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
    return { client, database: drizzle(client, { schema }) }
}

describe('DailyProjectionCoordinator', () => {
    it('reconciles missing and version-stale projection dates without a read request', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values([
            {
                definitionId: 'steps',
                canonicalValue: 100,
                canonicalUnit: 'count',
                originalValue: 100,
                originalUnit: 'count',
                observedAt: new Date('2026-08-22T12:00:00.000Z'),
            },
            {
                definitionId: 'steps',
                canonicalValue: 200,
                canonicalUnit: 'count',
                originalValue: 200,
                originalUnit: 'count',
                observedAt: new Date('2026-08-23T12:00:00.000Z'),
            },
        ])
        await database.insert(schema.dailyProjectionRuns).values({
            date: '2026-08-22',
            derivationVersion: 1,
            resolutionVersion: 1,
            timezone: 'UTC',
            status: 'complete',
        })
        await database.insert(schema.dailyMetrics).values({
            date: '2026-08-24',
            definitionId: 'steps',
            value: 300,
            unit: 'count',
            derivationVersion: 1,
            resolutionVersion: 1,
            timezone: 'UTC',
        })

        const result = await new DailyProjectionCoordinator(database as never).reconcile()

        expect(result).toEqual({ queuedDates: 3 })
        expect(
            (await database.select().from(schema.projectionDirtyDates))
                .map(row => row.date)
                .sort(),
        ).toEqual(['2026-08-22', '2026-08-23', '2026-08-24'])
        await client.close()
    })

    it('attributes sleep to its wake date when discovering projection dates', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values({
            definitionId: 'sleep_duration',
            canonicalValue: 8,
            canonicalUnit: 'h',
            originalValue: 8,
            originalUnit: 'h',
            observedAt: new Date('2026-08-24T22:00:00.000Z'),
            endedAt: new Date('2026-08-25T06:00:00.000Z'),
        })

        const dates = await new DailyProjectionCoordinator(database as never).knownDates()

        expect([...dates]).toEqual(['2026-08-25'])
        await client.close()
    })

    it('includes later weight dates when a carry-forward height changes', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values([
            {
                definitionId: 'weight',
                canonicalValue: 80,
                canonicalUnit: 'kg',
                originalValue: 80,
                originalUnit: 'kg',
                observedAt: new Date('2026-08-20T08:00:00.000Z'),
            },
            {
                definitionId: 'weight',
                canonicalValue: 81,
                canonicalUnit: 'kg',
                originalValue: 81,
                originalUnit: 'kg',
                observedAt: new Date('2026-08-25T08:00:00.000Z'),
            },
        ])
        const coordinator = new DailyProjectionCoordinator(database as never)

        const dates = await coordinator.observationImpactDates([
            {
                definitionId: 'height',
                observedAt: new Date('2026-08-01T08:00:00.000Z'),
                endedAt: null,
            },
        ])

        expect([...dates].sort()).toEqual(['2026-08-01', '2026-08-20', '2026-08-25'])
        await client.close()
    })
})
