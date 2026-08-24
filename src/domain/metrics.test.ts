import { describe, expect, it } from 'vitest'
import { metricCatalog } from './metricCatalog'
import {
    convertMetricValue,
    detectUnitPreset,
    formatMetric,
    normalizedMetricPreferences,
    preferencesForPreset,
} from './metrics'

describe('metric registry', () => {
    it('has unique IDs and valid units', () => {
        expect(new Set(metricCatalog.map(metric => metric.id)).size).toBe(metricCatalog.length)
        for (const metric of metricCatalog) {
            expect(metric.canonicalUnit).toBeTruthy()
            expect(metric.displayUnits).toContain(metric.metricUnit)
            expect(metric.displayUnits).toContain(metric.imperialUnit)
        }
    })
})

describe('metric conversions and formatting', () => {
    it('converts weight reversibly', () => {
        const pounds = convertMetricValue('weight', 80, 'kg', 'lb')
        expect(pounds).toBeCloseTo(176.3698, 3)
        expect(convertMetricValue('weight', pounds, 'lb', 'kg')).toBeCloseTo(80, 8)
    })
    it('converts volume and supports identity', () => {
        expect(convertMetricValue('water', 1000, 'ml', 'L')).toBe(1)
        expect(convertMetricValue('water', 500, 'ml', 'ml')).toBe(500)
    })
    it('formats duration and registry precision', () => {
        expect(formatMetric('sleep', 7.5)).toBe('7 h 30 min')
        expect(formatMetric('weight', 80, preferencesForPreset('imperial'), 'en-US')).toBe(
            '176.4 lb',
        )
        expect(
            formatMetric('weight', 80, { weight: { displayUnit: 'kg', precision: 2 } }, 'en-US'),
        ).toBe('80.00 kg')
    })
})

describe('metric preferences', () => {
    it('applies and detects presets and custom configurations', () => {
        expect(detectUnitPreset(preferencesForPreset('metric'))).toBe('metric')
        expect(detectUnitPreset(preferencesForPreset('imperial'))).toBe('imperial')
        expect(
            detectUnitPreset({ ...preferencesForPreset('metric'), weight: { displayUnit: 'lb' } }),
        ).toBe('custom')
    })
    it('migrates legacy imperial preferences when per-metric values are absent', () => {
        expect(normalizedMetricPreferences(undefined, 'imperial').weight.displayUnit).toBe('lb')
        expect(normalizedMetricPreferences(undefined, 'imperial').steps.displayUnit).toBe('count')
    })
})
