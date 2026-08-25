import { describe, expect, it } from 'vitest'
import { ExportService } from './export.js'

describe('portable export', () => {
    it('emits a versioned complete JSON snapshot and deterministic CSV envelope', async () => {
        const data = {
            listSources: async () => [{ id: 'source', name: 'Health Connect' }],
            listObservations: async () => [{ id: 'observation' }],
            listRawObservations: async () => [{ id: 'observation' }],
            getPreferences: async () => ({ timezone: 'Europe/Amsterdam' }),
            listFoods: async () => [{ id: 'food' }],
            listRecipes: async () => [{ id: 'recipe' }],
            listGoals: async () => [{ id: 'goal' }],
            listSavedTrendViews: async () => [{ id: 'view' }],
        }
        const service = new ExportService(data as never)
        const snapshot = await service.snapshot()

        expect(snapshot).toMatchObject({
            schema: 'net.trackit.export',
            version: 2,
            data: {
                observations: [{ id: 'observation' }],
                sources: [{ id: 'source', name: 'Health Connect' }],
            },
        })
        const csv = await service.csv()
        expect(csv.split('\n')[0]).toBe('"collection","record"')
        expect(csv).toContain('"observations"')
    })
})
