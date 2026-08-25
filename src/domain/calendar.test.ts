import { describe, expect, it } from 'vitest'
import { calendarDateKey, calendarDayRange } from './calendar'

describe('calendar day boundaries', () => {
    it('uses the configured timezone and a half-open DST-aware range', () => {
        const selected = new Date('2026-03-29T12:00:00.000Z')
        const range = calendarDayRange(selected, 'Europe/Amsterdam')

        expect(calendarDateKey(selected, 'Europe/Amsterdam')).toBe('2026-03-29')
        expect(range.from.toISOString()).toBe('2026-03-28T23:00:00.000Z')
        expect(range.to.toISOString()).toBe('2026-03-29T22:00:00.000Z')
    })
})
