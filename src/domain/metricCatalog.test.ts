import { describe, expect, it } from 'vitest'
import { dailySeries, type Observation } from './health'
import { metricCatalog } from './metricCatalog'

describe('metric catalog', () => {
    it('includes every stored nutrition total', () => {
        const nutrition = metricCatalog
            .filter(metric => metric.source === 'meal')
            .map(metric => metric.value)

        expect(nutrition).toEqual([
            'calories',
            'protein',
            'carbs',
            'fat',
            'fiber',
            'sugar',
            'saturatedFat',
            'sodium',
            'potassium',
        ])
    })

    it('adds multiple nutrient snapshots into a daily total', () => {
        const records = [
            { id: 'a', canonicalValue: 20, observedAt: '2026-08-20T08:00:00Z' },
            { id: 'b', canonicalValue: 30, observedAt: '2026-08-20T12:00:00Z' },
        ].map(
            record =>
                ({
                    ...record,
                    metric: 'protein',
                    canonicalUnit: 'g',
                    originalValue: record.canonicalValue,
                    originalUnit: 'g',
                    excluded: false,
                    version: 1,
                }) satisfies Observation,
        )

        expect(dailySeries(records, new Date('2026-08-20T12:00:00Z'), 1, 'UTC')[0].value).toBe(50)
    })
})
