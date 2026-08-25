import { describe, expect, it } from 'vitest'
import { dateKeyInTimezone, localDayRange } from './timezone.js'

describe('metric projection timezone boundaries', () => {
    it('uses a 23-hour local day when daylight saving time starts', () => {
        const range = localDayRange('2026-03-29', 'Europe/Amsterdam')
        expect(range.from.toISOString()).toBe('2026-03-28T23:00:00.000Z')
        expect(range.to.toISOString()).toBe('2026-03-29T22:00:00.000Z')
        expect(range.to.getTime() - range.from.getTime()).toBe(23 * 60 * 60 * 1000)
    })

    it('uses a 25-hour local day when daylight saving time ends', () => {
        const range = localDayRange('2026-10-25', 'Europe/Amsterdam')
        expect(range.from.toISOString()).toBe('2026-10-24T22:00:00.000Z')
        expect(range.to.toISOString()).toBe('2026-10-25T23:00:00.000Z')
        expect(range.to.getTime() - range.from.getTime()).toBe(25 * 60 * 60 * 1000)
    })

    it('assigns instants to the user local date', () => {
        expect(dateKeyInTimezone(new Date('2026-08-24T22:30:00Z'), 'Europe/Amsterdam')).toBe(
            '2026-08-25',
        )
    })
})
