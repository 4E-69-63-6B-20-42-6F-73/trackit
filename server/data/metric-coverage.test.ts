import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { listMetricCoverage } from './metric-coverage.js'

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

describe('metric coverage summary', () => {
    it('summarizes active numeric records and sources inside the requested range', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values([
            {
                definitionId: 'steps',
                canonicalValue: 100,
                canonicalUnit: 'count',
                originalValue: 100,
                originalUnit: 'count',
                observedAt: new Date('2026-01-10T08:00:00Z'),
                metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
            },
            {
                definitionId: 'steps',
                canonicalValue: 200,
                canonicalUnit: 'count',
                originalValue: 200,
                originalUnit: 'count',
                observedAt: new Date('2026-01-11T08:00:00Z'),
                metadata: { source: 'Health Connect', dataOrigin: 'Samsung Health' },
            },
            {
                definitionId: 'steps',
                canonicalValue: 300,
                canonicalUnit: 'count',
                originalValue: 300,
                originalUnit: 'count',
                observedAt: new Date('2025-12-31T08:00:00Z'),
                metadata: { source: 'Health Connect', dataOrigin: 'Outside range' },
            },
            {
                definitionId: 'weight',
                canonicalValue: 80,
                canonicalUnit: 'kg',
                originalValue: 80,
                originalUnit: 'kg',
                observedAt: new Date('2026-01-12T08:00:00Z'),
                metadata: { source: 'You' },
            },
            {
                definitionId: 'weight',
                canonicalValue: 81,
                canonicalUnit: 'kg',
                originalValue: 81,
                originalUnit: 'kg',
                observedAt: new Date('2026-01-13T08:00:00Z'),
                metadata: { source: 'You' },
                excluded: true,
            },
        ])

        const coverage = await listMetricCoverage(database as never, {
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-02-01T00:00:00.000Z',
        })

        expect(coverage).toEqual([
            {
                definitionId: 'steps',
                recordCount: 2,
                availableFrom: '2026-01-10T08:00:00.000Z',
                availableTo: '2026-01-11T08:00:00.000Z',
                sources: ['Garmin', 'Health Connect', 'Samsung Health'],
            },
            {
                definitionId: 'weight',
                recordCount: 1,
                availableFrom: '2026-01-12T08:00:00.000Z',
                availableTo: '2026-01-12T08:00:00.000Z',
                sources: ['You'],
            },
        ])
        await client.close()
    })
})
