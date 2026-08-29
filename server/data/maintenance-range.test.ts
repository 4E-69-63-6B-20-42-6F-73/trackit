import { describe, expect, it } from 'vitest'
import { resolveMaintenanceDateRange } from './maintenance-range.js'

describe('resolveMaintenanceDateRange', () => {
    it('resolves recent-day presets using the profile timezone', () => {
        expect(
            resolveMaintenanceDateRange(
                { lastDays: 30 },
                'Pacific/Auckland',
                new Date('2026-08-29T12:30:00.000Z'),
            ),
        ).toEqual({ from: '2026-08-01', to: '2026-08-30' })
    })
})
