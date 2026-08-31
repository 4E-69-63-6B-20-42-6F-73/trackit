import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import { registerJournalDetailRoutes } from './routes.js'
import type { JournalRepository } from './types.js'

const id = '11111111-1111-4111-8111-111111111111'

describe('Journal detail route', () => {
    it('loads one full Journal entry without changing the list contract', async () => {
        const get = vi.fn().mockResolvedValue({
            id,
            definitionId: 'meal',
            category: 'Meals',
            title: 'Lunch',
            detail: '1 serving · 520 kcal',
            source: 'You',
            observedAt: '2026-08-30T12:00:00.000Z',
            version: 1,
            createdAt: '2026-08-30T12:00:00.000Z',
            updatedAt: '2026-08-30T12:00:00.000Z',
            detailView: {
                kind: 'meal',
                mealType: 'Lunch',
                nutrients: { calories: 520, protein: 32 },
                nutritionQuality: 'complete',
            },
        })
        const repository: JournalRepository = {
            list: vi.fn().mockResolvedValue([]),
            get,
            ready: vi.fn().mockResolvedValue(true),
        }
        const app = await createApp(repository)
        registerJournalDetailRoutes(app, repository)

        const response = await app.inject({ method: 'GET', url: `/api/journal/${id}` })

        expect(response.statusCode).toBe(200)
        expect(get).toHaveBeenCalledWith(id)
        expect(response.json()).toEqual({ data: expect.objectContaining({ id, title: 'Lunch' }) })
        await app.close()
    })
})
