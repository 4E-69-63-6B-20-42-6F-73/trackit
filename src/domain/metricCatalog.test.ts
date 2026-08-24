import { describe, expect, it } from 'vitest'
import { dailySeries, type Observation } from './health'
import { metricCatalog, metricDefinition } from './metricCatalog'

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

    it('defines valid, metric-appropriate goal aggregation and period combinations', () => {
        expect(metricDefinition('weight')?.goalCapabilities?.aggregations).toEqual({
            latest: ['day', 'week', 'rolling'],
            average: ['week', 'rolling'],
        })
        expect(metricDefinition('steps')?.goalCapabilities?.aggregations).toEqual({
            total: ['day', 'week', 'rolling'],
            average: ['week', 'rolling'],
        })
        expect(metricDefinition('sleep')?.goalCapabilities?.aggregations).toEqual({
            total: ['week', 'rolling'],
            average: ['week', 'rolling'],
        })
        expect(metricDefinition('resting_heart_rate')?.goalCapabilities?.aggregations).toEqual({
            latest: ['day', 'week', 'rolling'],
            average: ['week', 'rolling'],
        })
    })

    it('keeps each suggested goal inside the metric capability matrix', () => {
        for (const metric of metricCatalog.filter(item => item.goalDefaults)) {
            const defaults = metric.goalDefaults!
            expect(metric.goalCapabilities?.aggregations[defaults.aggregation]).toContain(
                defaults.period,
            )
            expect(metric.goalCapabilities?.comparators).toContain(defaults.comparator)
        }
    })
})
