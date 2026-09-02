import { describe, expect, it } from 'vitest'
import {
    calendarDateKey,
    calendarDateKeysThrough,
    calendarDayRangeForKey,
    nextCalendarDateKey,
} from '@trackit/domain/calendar'

describe('calendar day boundaries', () => {
    it('uses a 23-hour Amsterdam day when daylight saving time starts', () => {
        const range = calendarDayRangeForKey('2026-03-29', 'Europe/Amsterdam')

        expect(range.from.toISOString()).toBe('2026-03-28T23:00:00.000Z')
        expect(range.to.toISOString()).toBe('2026-03-29T22:00:00.000Z')
        expect(range.to.getTime() - range.from.getTime()).toBe(23 * 60 * 60 * 1000)
    })

    it('uses a 25-hour Amsterdam day when daylight saving time ends', () => {
        const range = calendarDayRangeForKey('2026-10-25', 'Europe/Amsterdam')

        expect(range.from.toISOString()).toBe('2026-10-24T22:00:00.000Z')
        expect(range.to.toISOString()).toBe('2026-10-25T23:00:00.000Z')
        expect(range.to.getTime() - range.from.getTime()).toBe(25 * 60 * 60 * 1000)
    })

    it('handles negative UTC offsets across US daylight saving boundaries', () => {
        const spring = calendarDayRangeForKey('2026-03-08', 'America/New_York')
        const fall = calendarDayRangeForKey('2026-11-01', 'America/New_York')

        expect(spring.from.toISOString()).toBe('2026-03-08T05:00:00.000Z')
        expect(spring.to.toISOString()).toBe('2026-03-09T04:00:00.000Z')
        expect(fall.from.toISOString()).toBe('2026-11-01T04:00:00.000Z')
        expect(fall.to.toISOString()).toBe('2026-11-02T05:00:00.000Z')
    })

    it('handles quarter-hour and half-hour timezone offsets', () => {
        const kathmandu = calendarDayRangeForKey('2026-08-25', 'Asia/Kathmandu')
        const adelaide = calendarDayRangeForKey('2026-10-04', 'Australia/Adelaide')

        expect(kathmandu.from.toISOString()).toBe('2026-08-24T18:15:00.000Z')
        expect(kathmandu.to.toISOString()).toBe('2026-08-25T18:15:00.000Z')
        expect(adelaide.from.toISOString()).toBe('2026-10-03T14:30:00.000Z')
        expect(adelaide.to.toISOString()).toBe('2026-10-04T13:30:00.000Z')
    })

    it('assigns instants to the configured local date', () => {
        expect(calendarDateKey(new Date('2026-08-24T22:30:00Z'), 'Europe/Amsterdam')).toBe(
            '2026-08-25',
        )
        expect(calendarDateKey(new Date('2026-08-25T03:30:00Z'), 'America/New_York')).toBe(
            '2026-08-24',
        )
    })

    it('iterates calendar date keys without depending on timezone offsets', () => {
        expect(nextCalendarDateKey('2026-02-28')).toBe('2026-03-01')
        expect(calendarDateKeysThrough('2026-12-30', '2027-01-02')).toEqual([
            '2026-12-30',
            '2026-12-31',
            '2027-01-01',
            '2027-01-02',
        ])
    })
})
