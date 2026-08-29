import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markProjectionDatesDirty } from './projection-state.js'
import { ProjectionMaintenanceService } from './projection-maintenance.js'

vi.mock('./projection-state.js', () => ({
    markProjectionDatesDirty: vi.fn(),
}))

const query = (result: unknown) => ({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
})

const distinctQuery = (result: unknown) => ({
    from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    }),
})

describe('ProjectionMaintenanceService', () => {
    beforeEach(() => vi.clearAllMocks())

    it('queues canonical observation dates and existing projection dates', async () => {
        const select = vi
            .fn()
            .mockReturnValueOnce(query([{ timezone: 'Europe/Amsterdam' }]))
            .mockReturnValueOnce(distinctQuery([{ date: '2026-08-27' }, { date: '2026-08-28' }]))
            .mockReturnValueOnce({
                from: vi.fn().mockResolvedValue([{ date: '2026-08-28' }, { date: '2026-08-29' }]),
            })
            .mockReturnValueOnce(distinctQuery([{ date: '2026-08-26' }, { date: '2026-08-29' }]))
        const database = { select, selectDistinct: select }

        const result = await new ProjectionMaintenanceService(database as never).rebuildAll()

        expect(result).toEqual({ queuedDates: 4 })
        expect(markProjectionDatesDirty).toHaveBeenCalledTimes(1)
        expect([
            ...((markProjectionDatesDirty as ReturnType<typeof vi.fn>).mock
                .calls[0][1] as Set<string>),
        ]).toEqual(expect.arrayContaining(['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29']))
    })
})
