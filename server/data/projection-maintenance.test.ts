import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectionMaintenanceService } from './projection-maintenance.js'

const knownDates = vi.fn()
const invalidateDates = vi.fn()

vi.mock('./projection-coordinator.js', () => ({
    DailyProjectionCoordinator: vi.fn(function DailyProjectionCoordinator() {
        return { knownDates, invalidateDates }
    }),
}))

const selected = (result: unknown) => ({
    from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
    }),
})

describe('ProjectionMaintenanceService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        knownDates.mockResolvedValue(
            new Set(['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29']),
        )
    })

    it('queues known projection dates inside the resolved maintenance range', async () => {
        const database = {
            select: vi.fn().mockReturnValue(selected([{ timezone: 'Europe/Amsterdam' }])),
        }

        const result = await new ProjectionMaintenanceService(database as never).rebuild({
            from: '2026-08-26',
            to: '2026-08-29',
        })

        expect(knownDates).toHaveBeenCalledWith({ from: '2026-08-26', to: '2026-08-29' })
        expect(invalidateDates).toHaveBeenCalledWith(
            new Set(['2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29']),
        )
        expect(result).toEqual({ queuedDates: 4 })
    })
})
