import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import type {
    CreateJournalEntry,
    JournalEntry,
    JournalRepository,
    UpdateJournalEntry,
} from './journal/types.js'
import type { DataRepository, RecordRange } from './data/types.js'

class FiveYearJournal implements JournalRepository {
    private readonly entries: JournalEntry[] = Array.from({ length: 5 * 365 * 5 }, (_, index) => {
        const observedAt = new Date(
            Date.UTC(2021, 0, 1) + index * 4.8 * 60 * 60 * 1000,
        ).toISOString()
        return {
            id: `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`,
            category: index % 2 ? 'Meals' : 'Measurements',
            title: `Representative record ${index}`,
            detail: 'Small realistic payload with provenance',
            source: 'Performance fixture',
            observedAt,
            version: 1,
            createdAt: observedAt,
            updatedAt: observedAt,
        }
    })

    async list(): Promise<JournalEntry[]> {
        return this.entries
    }

    async create(_input: CreateJournalEntry): Promise<JournalEntry> {
        throw new Error('not used')
    }

    async update(_id: string, _input: UpdateJournalEntry): Promise<JournalEntry | null> {
        return null
    }

    async remove(_id: string): Promise<boolean> {
        return false
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
            id: index,
            metric: 'steps',
            observedAt,
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

    async listSavedTrendViews(): Promise<unknown[]> {
        return []
    }

    async createSavedTrendView(input: unknown): Promise<unknown> {
        return input
    }
}

describe('large-history performance', () => {
    it('keeps the journal API P95 below 500 ms with five representative years', async () => {
        const app = await createApp(new FiveYearJournal())
        await app.inject({ method: 'GET', url: '/api/journal' })
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
    })

    it('keeps dashboard range responses P95 below 500 ms with five years of history', async () => {
        const app = await createApp(new FiveYearJournal(), {
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
