import { describe, expect, it } from 'vitest'
import { metricDefinition } from './metricCatalog'
import { compareTodayHeadlineMetrics, isTodayHeadlineMetric } from './todaySummary'

describe('Today headline metrics', () => {
    it('keeps sleep stages out of the overview and preserves headline priority', () => {
        const definitions = [
            'sleep_awake',
            'sleep_deep',
            'sleep_light',
            'sleep_rem',
            'sleep',
            'heart_rate',
            'resting_heart_rate',
            'energy',
            'weight',
        ]
            .map(id => metricDefinition(id))
            .filter((definition): definition is NonNullable<typeof definition> => Boolean(definition))

        const selected = definitions
            .filter(isTodayHeadlineMetric)
            .sort(compareTodayHeadlineMetrics)
            .slice(0, 4)
            .map(definition => definition.id)

        expect(selected).toEqual(['sleep', 'heart_rate', 'resting_heart_rate', 'energy'])
    })

    it('treats sleep stages as details rather than headline metrics', () => {
        for (const id of ['sleep_awake', 'sleep_deep', 'sleep_light', 'sleep_rem']) {
            const definition = metricDefinition(id)
            expect(definition).toBeDefined()
            expect(isTodayHeadlineMetric(definition!)).toBe(false)
        }
    })
})
