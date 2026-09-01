import { performance } from 'node:perf_hooks'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'
import type { JournalEntry, JournalRepository } from './journal/types.js'
import { PostgresJournalRepository } from './journal/postgres-repository.js'
import type { DataRepository, RecordRange } from './data/types.js'
import * as schema from './db/schema.js'
import { applyTestMigrations } from './db/test-migrations.js'

class EmptyJournal implements JournalRepository {
    async list(): Promise<JournalEntry[]> {
        return []
    }

    async ready(): Promise<boolean> {
        return true
    }
}

class FiveYearData implements DataRepository {
    async listSources(): Promise<unknown[]> {
        return []
    }

    private readonly records = Array.from({ length: 5 * 365 }, (_, index) => {
        const observedAt = new Date(
            Date.UTC(2021, 0, 1) + index * 24 * 60 * 60 * 1000,
        ).toISOString()
        return {
            id: String(index),
            definitionId: 'steps',
            canonicalValue: 7000,
            canonicalUnit: 'count',
            originalValue: 7000,
            originalUnit: 'count',
            observedAt,
            excluded: false,
            version: 1,
            eatenAt: observedAt,
            nutrientSnapshot: { calories: 2000, protein: 100 },
        }
    })

    private inRange(value: string, range: RecordRange = {}) {
        return (!range.from || value >= range.from) && (!range.to || value <= range.to)
    }

    async listObservations(range?: RecordRange): Promise<unknown[]> {
        return this.records.filter(record => this.inRange(record.observedAt, range))
    }

    async listRawObservations(range?: RecordRange): Promise<unknown[]> {
        return this.records.filter(record => this.inRange(record.observedAt, range))
    }

    async listMeals(range?: RecordRange): Promise<unknown[]> {
        return this.records.filter(record => this.inRange(record.eatenAt, range))
    }

    async createObservation(input: unknown): Promise<unknown> {
        return input
    }

    async updateObservation(): Promise<unknown | null> {
        return null
    }

    async removeObservation(): Promise<boolean> {
        return false
    }

    async createMeal(input: unknown): Promise<unknown> {
        return input
    }

    async updateMeal(): Promise<unknown | null> {
        return null
    }

    async removeMeal(): Promise<boolean> {
        return false
    }

    async getPreferences(): Promise<unknown> {
        return {}
    }

    async updatePreferences(input: unknown): Promise<unknown> {
        return input
    }

    async listFoods(): Promise<unknown[]> {
        return []
    }

    async createFood(input: unknown): Promise<unknown> {
        return input
    }

    async updateFood(): Promise<unknown | null> {
        return null
    }

    async importFoods(input: unknown): Promise<unknown> {
        return input
    }

    async listRecipes(): Promise<unknown[]> {
        return []
    }

    async createRecipe(input: unknown): Promise<unknown> {
        return input
    }

    async updateRecipe(): Promise<unknown | null> {
        return null
    }

    async listGoals(): Promise<unknown[]> {
        return []
    }

    async createGoal(input: unknown): Promise<unknown> {
        return input
    }
    async retireGoal(): Promise<unknown | null> {
        return null
    }
    async updateGoal(): Promise<unknown | null> {
        return null
    }
    async removeGoal(): Promise<boolean> {
        return false
    }

    async listSavedTrendViews(): Promise<unknown[]> {
        return []
    }

    async createSavedTrendView(input: unknown): Promise<unknown> {
        return input
    }
}

describe('large-history performance', () => {
    it('does not allow the observations API to bypass the effective series', async () => {
        const data = new FiveYearData()
        const effective = [
            {
                id: 'effective',
                definitionId: 'steps',
                canonicalValue: 7000,
                canonicalUnit: 'count',
                originalValue: 7000,
                originalUnit: 'count',
                observedAt: '2026-01-01T00:00:00.000Z',
                excluded: false,
                version: 1,
            },
        ]
        data.listObservations = vi.fn().mockResolvedValue(effective)
        data.listRawObservations = vi.fn().mockResolvedValue([
            { id: 'raw-garmin', metric: 'steps', canonicalValue: 7000 },
            { id: 'raw-samsung', metric: 'steps', canonicalValue: 7000 },
        ])
        const app = await createApp(new EmptyJournal(), { dataRepository: data })

        const response = await app.inject({ method: 'GET', url: '/api/observations?series=raw' })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ data: effective })
        expect(data.listRawObservations).not.toHaveBeenCalled()
        await app.close()
    })

    it('keeps the real Journal read path P95 below 500 ms with five representative years', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const recordCount = 5 * 365 * 5
        const base = Date.UTC(2021, 0, 1)
        const records = Array.from({ length: recordCount }, (_, index) => {
            const meal = index % 2 === 1
            return {
                definitionId: meal ? 'meal' : 'weight',
                valueType: 'number',
                canonicalValue: meal ? null : 70 + (index % 100) / 10,
                canonicalUnit: meal ? null : 'kg',
                category: meal ? 'Meals' : 'Measurements',
                title: `Representative record ${index}`,
                observedAt: new Date(base + index * 4.8 * 60 * 60 * 1000),
                origin: 'external',
                attributes: meal
                    ? {
                          sourceLabel: 'Performance fixture',
                          mealType: 'Lunch',
                          serving: { amount: 1, unit: 'serving' },
                          nutrientSnapshot: {
                              calories: 520,
                              protein: 32,
                              carbs: 58,
                              fat: 18,
                              fiber: 9,
                              sugar: 7,
                              sodium: 640,
                              potassium: 780,
                          },
                      }
                    : { sourceLabel: 'Performance fixture' },
            }
        })
        for (let offset = 0; offset < records.length; offset += 500)
            await database.insert(schema.observations).values(records.slice(offset, offset + 500))

        const app = await createApp(new PostgresJournalRepository(database as never))
        const warm = await app.inject({ method: 'GET', url: '/api/journal' })
        expect(warm.statusCode).toBe(200)
        const warmBody = warm.json() as { data: Record<string, unknown>[] }
        expect(warmBody.data).toHaveLength(100)
        expect(warmBody.data.every(entry => !('detailView' in entry))).toBe(true)
        expect(Buffer.byteLength(warm.body, 'utf8')).toBeLessThan(100_000)

        const samples: number[] = []
        for (let index = 0; index < 20; index += 1) {
            const started = performance.now()
            const response = await app.inject({ method: 'GET', url: '/api/journal' })
            samples.push(performance.now() - started)
            expect(response.statusCode).toBe(200)
        }
        samples.sort((left, right) => left - right)
        const p95 = samples[Math.ceil(samples.length * 0.95) - 1]
        expect(p95).toBeLessThan(500)
        await app.close()
        await client.close()
    })

    it('keeps dashboard range responses P95 below 500 ms with five years of history', async () => {
        const app = await createApp(new EmptyJournal(), {
            dataRepository: new FiveYearData(),
        })
        const from = new Date(Date.UTC(2025, 11, 1)).toISOString()
        const urls = [
            `/api/observations?from=${encodeURIComponent(from)}`,
            `/api/meals?from=${encodeURIComponent(from)}`,
        ]
        const samples: number[] = []
        for (let index = 0; index < 20; index += 1) {
            const started = performance.now()
            const responses = await Promise.all(urls.map(url => app.inject({ method: 'GET', url })))
            samples.push(performance.now() - started)
            expect(responses.every(response => response.statusCode === 200)).toBe(true)
        }
        samples.sort((left, right) => left - right)
        expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(500)
        await app.close()
    })
})
