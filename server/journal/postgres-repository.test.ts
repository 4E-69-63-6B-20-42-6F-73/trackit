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

    it('keeps list payloads compact and loads meal details separately', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const data = new PostgresDataRepository(database as never)
        const journal = new PostgresJournalRepository(database as never)

        const created = await data.createMeal({
            name: 'Plain Skyr',
            mealType: 'Dinner',
            eatenAt: '2026-08-25T19:15:00.000Z',
            nutrients: {
                calories: 94.5,
                protein: 16.5,
                carbs: 6,
                fat: 0.3,
                sodium: 120,
            },
            favorite: false,
            nutritionQuality: 'estimated',
            serving: { amount: 150, unit: 'g' },
        })

        const [summary] = await journal.list()
        expect(summary).toEqual(
            expect.objectContaining({
                id: created.id,
                title: 'Plain Skyr',
                detail: '150 g · 94.5 kcal',
                category: 'Meals',
            }),
        )
        expect(summary).not.toHaveProperty('detailView')
        expect(await journal.get(created.id)).toEqual(
            expect.objectContaining({
                detailView: {
                    kind: 'meal',
                    mealType: 'Dinner',
                    serving: { amount: 150, unit: 'g' },
                    nutrients: {
                        calories: 94.5,
                        protein: 16.5,
                        carbs: 6,
                        fat: 0.3,
                        sodium: 120,
                    },
                    nutritionQuality: 'estimated',
                },
            }),
        )
        await client.close()
    })

    it('applies source filtering before the page limit', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const journal = new PostgresJournalRepository(database as never)
        const base = Date.UTC(2026, 0, 1)
        await database.insert(schema.observations).values(
            Array.from({ length: 101 }, (_, index) => ({
                definitionId: 'weight',
                canonicalValue: 80 + index / 100,
                canonicalUnit: 'kg',
                category: 'Measurements',
                title: `Weight ${index}`,
                observedAt: new Date(base + index * 60_000),
                origin: 'external',
                attributes: { sourceLabel: index === 0 ? 'Target source' : 'Other source' },
            })),
        )

        expect(await journal.list({ source: 'Target source', limit: 1 })).toEqual([
            expect.objectContaining({ title: 'Weight 0', source: 'Target source' }),
        ])
        await client.close()
    })
})
