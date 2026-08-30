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
            listPlanItems: async () => [
                {
                    planItem: { id: 'plan', scheduledDate: '2026-09-02' },
                    meal: { mealType: 'Dinner', referenceType: 'recipe', recipeId: 'recipe' },
                },
            ],
        }
        const journal = { list: async () => [{ id: 'journal' }] }
        const service = new ExportService(data as never, journal as never)
        const snapshot = await service.snapshot()

        expect(snapshot).toMatchObject({
            schema: 'net.trackit.export',
            version: 3,
            data: {
                observations: [{ id: 'observation' }],
                sources: [{ id: 'source', name: 'Health Connect' }],
                foods: [{ id: 'food' }],
                recipes: [{ id: 'recipe' }],
                goals: [{ id: 'goal' }],
                planItems: [
                    {
                        planItem: { id: 'plan', scheduledDate: '2026-09-02' },
                        meal: { mealType: 'Dinner', referenceType: 'recipe', recipeId: 'recipe' },
                    },
                ],
            },
        })
        expect(snapshot.data).not.toHaveProperty('journal')
        expect(snapshot.data).not.toHaveProperty('meals')
        const csv = await service.csv()
        expect(csv.split('\n')[0]).toBe('"collection","record"')
        expect(csv).toContain('"observations"')
        expect(csv).toContain('"planItems"')
        expect(csv).not.toContain('"journal"')
    })
})
