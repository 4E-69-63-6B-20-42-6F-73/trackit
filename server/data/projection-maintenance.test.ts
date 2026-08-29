import { beforeEach, describe, expect, it, vi } from 'vitest'
import { markProjectionDatesDirty } from './projection-state.js'
import { ProjectionMaintenanceService } from './projection-maintenance.js'

vi.mock('./projection-state.js', () => ({
    markProjectionDatesDirty: vi.fn(),
}))

const selected = (result: unknown) => ({
    from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
    }),
})

describe('ProjectionMaintenanceService', () => {
    beforeEach(() => vi.clearAllMocks())

    it('queues canonical observation dates and existing projection dates inside the range', async () => {
        const select = vi.fn().mockReturnValue(selected([{ timezone: 'Europe/Amsterdam' }]))
        const selectDistinct = vi
            .fn()
            .mockReturnValueOnce(selected([{ date: '2026-08-27' }, { date: '2026-08-28' }]))
            .mockReturnValueOnce(selected([{ date: '2026-08-28' }, { date: '2026-08-29' }]))
            .mockReturnValueOnce(selected([{ date: '2026-08-26' }, { date: '2026-08-29' }]))
        const database = { select, selectDistinct }

        const result = await new ProjectionMaintenanceService(database as never).rebuild({
            from: '2026-08-26',
            to: '2026-08-29',
        })

        expect(result).toEqual({ queuedDates: 4 })
        expect(markProjectionDatesDirty).toHaveBeenCalledTimes(1)
        expect([
            ...((markProjectionDatesDirty as ReturnType<typeof vi.fn>).mock.calls[0][1] as Set<string>),
        ]).toEqual(
            expect.arrayContaining(['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29']),
        )
    })
})
