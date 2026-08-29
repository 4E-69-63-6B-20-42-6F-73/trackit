import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { PostgresJournalRepository } from './postgres-repository.js'
import { PostgresDataRepository } from '../data/postgres-repository.js'

describe('Journal observation projection preferences', () => {
    it('projects Observation create, update, and delete commands without Journal writes', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const observations = new PostgresDataRepository(database as never)
        const journal = new PostgresJournalRepository(database as never)
        const created = await observations.createObservation({
            definitionId: 'note',
            valueType: 'text',
            textValue: 'Initial detail',
            title: 'Initial title',
            category: 'Check-ins',
            observedAt: '2026-08-25T08:00:00.000Z',
            source: 'You',
        })

        expect(await journal.list()).toEqual([
            expect.objectContaining({ id: created.id, title: 'Initial title' }),
        ])

        await observations.updateObservation(created.id, {
            title: 'Corrected title',
            textValue: 'Corrected detail',
            version: Number(created.version),
        })
        expect(await journal.list()).toEqual([
            expect.objectContaining({
                id: created.id,
                title: 'Corrected title',
                detail: 'Corrected detail',
            }),
        ])

        await observations.removeObservation(created.id)
        expect(await journal.list()).toEqual([])
        await client.close()
    })

    it('hides disabled metrics and can opt a quiet metric into Journal', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        await database.insert(schema.preferences).values({
            id: 'owner',
            metricPreferences: {
                weight: { displayUnit: 'kg', showInJournal: false },
                heart_rate: { displayUnit: 'bpm', showInJournal: true },
            },
        })
        await database.insert(schema.observations).values([
            {
                definitionId: 'weight',
                canonicalValue: 80,
                canonicalUnit: 'kg',
                originalValue: 80,
                originalUnit: 'kg',
                category: 'Measurements',
                title: 'Weight',
                observedAt: new Date('2026-08-25T08:00:00Z'),
            },
            {
                definitionId: 'heart_rate',
                canonicalValue: 65,
                canonicalUnit: 'bpm',
                originalValue: 65,
                originalUnit: 'bpm',
                title: 'Heart rate',
                observedAt: new Date('2026-08-25T09:00:00Z'),
            },
        ])

        const rows = await new PostgresJournalRepository(database as never).list()
        expect(rows).toEqual([
            expect.objectContaining({ title: 'Heart rate', category: 'Measurements' }),
        ])
        await client.close()
    })
})
