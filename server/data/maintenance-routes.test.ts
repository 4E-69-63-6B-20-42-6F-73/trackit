import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import type { JournalRepository } from '../journal/types.js'
import { registerDataMaintenanceRoutes } from './maintenance-routes.js'

const repository: JournalRepository = {
    list: async () => [],
    ready: async () => true,
}

const services = () => ({
    projections: {
        rebuild: vi.fn().mockResolvedValue({ queuedDates: 2 }),
    },
    providerRecords: {
        rederive: vi.fn().mockResolvedValue({
            sourceRecords: 3,
            canonicalObservations: 7,
            queuedProjectionDates: 4,
        }),
    },
})

describe('data maintenance routes', () => {
    it('validates ranges and forwards successful requests', async () => {
        const app = await createApp(repository)
        const maintenance = services()
        await registerDataMaintenanceRoutes(app, maintenance)

        const response = await app.inject({
            method: 'POST',
            url: '/api/data/rederive-observations',
            payload: { from: '2026-08-28', to: '2026-08-29' },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({
            data: {
                sourceRecords: 3,
                canonicalObservations: 7,
                queuedProjectionDates: 4,
            },
        })
        expect(maintenance.providerRecords.rederive).toHaveBeenCalledWith({
            from: '2026-08-28',
            to: '2026-08-29',
        })

        const invalid = await app.inject({
            method: 'POST',
            url: '/api/data/rebuild-projections',
            payload: { from: '2026-08-30', to: '2026-08-29' },
        })
        expect(invalid.statusCode).toBe(400)
        expect(invalid.json()).toEqual({ error: 'invalid_range' })
        await app.close()
    })

    it('inherits authentication and CSRF protection from the application', async () => {
        const app = await createApp(repository, {
            auth: {
                authenticate: async () => null,
            } as never,
        })
        await registerDataMaintenanceRoutes(app, services())

        const response = await app.inject({
            method: 'POST',
            url: '/api/data/rederive-observations',
            payload: {},
        })

        expect(response.statusCode).toBe(401)
        expect(response.json()).toEqual({ error: 'unauthorized' })
        await app.close()
    })

    it('uses the application error handler for maintenance failures', async () => {
        const app = await createApp(repository)
        const maintenance = services()
        maintenance.providerRecords.rederive.mockRejectedValue(new Error('database failure'))
        await registerDataMaintenanceRoutes(app, maintenance)

        const response = await app.inject({
            method: 'POST',
            url: '/api/data/rederive-observations',
            payload: {},
        })

        expect(response.statusCode).toBe(500)
        expect(response.json()).toEqual({
            error: 'internal_error',
            requestId: expect.any(String),
        })
        await app.close()
    })
})
