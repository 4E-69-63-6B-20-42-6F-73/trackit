import { describe, expect, it } from 'vitest'
import { aggregateMetric, metricDefinition } from './metric-registry.js'

describe('daily metric aggregation semantics', () => {
    const at = (value: number, hour: number) => ({
        value,
        observedAt: new Date(`2026-08-23T${String(hour).padStart(2, '0')}:00:00Z`),
    })

    it('sums additive metrics and uses the latest body measurement', () => {
        expect(metricDefinition('steps')?.aggregation).toBe('sum')
        expect(aggregateMetric('sum', [at(1000, 8), at(2500, 18)])).toBe(3500)
        expect(aggregateMetric('latest', [at(80, 18), at(79, 8)])).toBe(80)
    })

    it('uses robust median and average semantics where registered', () => {
        expect(metricDefinition('resting_heart_rate')?.aggregation).toBe('median')
        expect(aggregateMetric('median', [at(49, 1), at(200, 2), at(51, 3)])).toBe(51)
        expect(aggregateMetric('average', [at(60, 1), at(80, 2)])).toBe(70)
    })
})
