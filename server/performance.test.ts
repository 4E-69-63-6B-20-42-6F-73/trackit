import { performance } from 'node:perf_hooks'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it, vi } from 'vitest'
import type { NumericObservation } from '@trackit/domain/health'
import { createApp } from './app.js'
import type { JournalEntry, JournalRepository } from './journal/types.js'
import { PostgresJournalRepository } from './journal/postgres-repository.js'
import type {
    DataRepository,
    MealRecord,
    MealRepository,
    ObservationRepository,
    RecordRange,
} from './data/types.js'
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

type PerformanceRepository = Pick<ObservationRepository, 'listObservations'> &
    Pick<MealRepository, 'listMeals'>

type PerformanceRecord = NumericObservation & {
    eatenAt: string
    nutrientSnapshot: Record<string, number>
}

class FiveYearData implements PerformanceRepository {
    private readonly records: PerformanceRecord[] = Array.from({ length: 5 * 365 }, (_, index) => {
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

    async listObservations(range?: RecordRange): Promise<NumericObservation[]> {
        return this.records.filter(record => this.inRange(record.observedAt, range))
    }

    async listRawObservations(): Promise<never[]> {
        return []
    }

    async listMeals(range?: RecordRange): Promise<MealRecord[]> {
        return this.records
            .filter(record => this.inRange(record.eatenAt, range))
            .map(record => ({
                id: record.id,
                name: `Meal ${record.id}`,
                mealType: 'Lunch',
                eatenAt: new Date(record.eatenAt),
                nutrientSnapshot: record.nutrientSnapshot,
                nutritionQuality: 'complete',
                favorite: false,
                sourceId: null,
                version: record.version,
                createdAt: new Date(record.eatenAt),
                updatedAt: new Date(record.eatenAt),
                deletedAt: null,
            }))
    }
}

const asApplicationRepository = (data: FiveYearData) => data as unknown as DataRepository

describe('large-history performance', () => {
    it('does not allow the observations API to bypass the effective series', async () => {
        const data = new FiveYearData()
        const effective: NumericObservation[] = [
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
        const listRawObservations = vi.spyOn(data, 'listRawObservations')
        const app = await createApp(new EmptyJournal(), {
            dataRepository: asApplicationRepository(data),
        })

        const response = await app.inject({ method: 'GET', url: '/api/observations?series=raw' })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ data: effective })
        expect(listRawObservations).not.toHaveBeenCalled()
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
            dataRepository: asApplicationRepository(new FiveYearData()),
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
