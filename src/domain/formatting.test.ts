import { describe, expect, it } from 'vitest'
import { formatMetricValue, friendlySourceName } from './formatting'

describe('shared display formatting', () => {
    it('formats sleep duration without exposing decimal hours', () => {
        expect(formatMetricValue(9.033333333333333, 'hours', 'en-US')).toBe('9 h 2 min')
        expect(formatMetricValue(0.6, 'hours', 'en-US', { signed: true })).toBe('+36 min')
    })

    it('uses human labels for counts and known Health Connect sources', () => {
        expect(formatMetricValue(10000, 'count', 'en-US')).toBe('10,000 steps')
        expect(friendlySourceName('COM.GOOGLE.ANDROID.APPS.FITNESS')).toBe('Google Fit')
        expect(friendlySourceName('CN.FITDAYS.FITDAYS')).toBe('Fitdays scale')
    })
})
