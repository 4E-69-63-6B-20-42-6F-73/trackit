import { describe, expect, it } from 'vitest'
import { deriveWindowMetrics } from './derive-window.js'

describe('cross-record derivation', () => {
    it('is isolated from record projection and versions rolling outputs', () => {
        const derived = deriveWindowMetrics(
            [
                { date: '2026-08-22', metric: 'steps', value: 8000, unit: 'count' },
                { date: '2026-08-23', metric: 'steps', value: 10000, unit: 'count' },
                { date: '2026-08-01', metric: 'hrv_rmssd', value: 40, unit: 'ms' },
                { date: '2026-08-23', metric: 'hrv_rmssd', value: 50, unit: 'ms' },
            ],
            new Date('2026-08-23T12:00:00Z'),
        )
        expect(derived).toMatchObject([
            { metric: 'steps_7d_average', value: 9000, derivationVersion: 1 },
            { metric: 'hrv_28d_baseline', value: 45, derivationVersion: 1 },
        ])
    })
})
