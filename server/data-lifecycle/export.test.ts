import { describe, expect, it } from 'vitest'
import { ExportService } from './export.js'

describe('portable export', () => {
    it('emits a versioned canonical JSON snapshot and deterministic CSV envelope', async () => {
        const data = {
            listSources: async () => [{ id: 'source', name: 'Health Connect' }],
            listRawObservations: async () => [{ id: 'observation' }],
            listObservations: async () => [{ id: 'effective-observation' }],
            listMeals: async () => [{ id: 'meal', nutrientSnapshot: { protein: 20 } }],
            getPreferences: async () => ({ timezone: 'Europe/Amsterdam' }),
            listFoods: async () => [{ id: 'food' }],
            listRecipes: async () => [{ id: 'recipe' }],
            listGoals: async () => [{ id: 'goal' }],
            listSavedTrendViews: async () => [{ id: 'view' }],
        }
        const journal = { list: async () => [{ id: 'journal' }] }
        const service = new ExportService(data as never, journal as never)
        const snapshot = await service.snapshot()

        expect(snapshot).toMatchObject({
            schema: 'net.trackit.export',
            version: 2,
            data: {
                observations: [{ id: 'observation' }],
                sources: [{ id: 'source', name: 'Health Connect' }],
                foods: [{ id: 'food' }],
                recipes: [{ id: 'recipe' }],
                goals: [{ id: 'goal' }],
            },
        })
        expect(snapshot.data).not.toHaveProperty('journal')
        expect(snapshot.data).not.toHaveProperty('meals')
        const csv = await service.csv()
        expect(csv.split('\n')[0]).toBe('"collection","record"')
        expect(csv).toContain('"observations"')
        expect(csv).not.toContain('"journal"')
    })
})
