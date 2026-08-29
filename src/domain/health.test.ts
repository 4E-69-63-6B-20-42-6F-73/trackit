import { describe, expect, it } from 'vitest'
import {
    dailySeries,
    displayValue,
    pearsonCorrelation,
    rollingBaselineDelta,
    weeklySeries,
    type NumericObservation,
} from './health'

const observation = (id: string, observedAt: string, value: number): NumericObservation => ({
    id,
    definitionId: 'weight',
    canonicalValue: value,
    canonicalUnit: 'kg',
    originalValue: value,
    originalUnit: 'kg',
    observedAt,
    excluded: false,
    version: 1,
})

describe('health calculations', () => {
    it('converts display units without changing canonical input', () => {
        const value = 80
        expect(displayValue('weight', value, 'kg', 'lb')).toBeCloseTo(176.37, 2)
        expect(value).toBe(80)
    })

    it('keeps missing days and respects timezone day boundaries', () => {
        const records = [observation('one', '2026-03-29T22:30:00.000Z', 80)]
        expect(
            dailySeries(records, new Date('2026-03-29T12:00:00Z'), 3, 'Europe/Amsterdam'),
        ).toEqual([
            { date: '2026-03-29', value: null, recordIds: [] },
            { date: '2026-03-30', value: 80, recordIds: ['one'] },
            { date: '2026-03-31', value: null, recordIds: [] },
        ])
    })

    it('sums additive records and uses the latest scalar record reproducibly', () => {
        const records = [
            { ...observation('one', '2026-08-20T08:00:00Z', 1000), definitionId: 'steps' },
            { ...observation('two', '2026-08-20T09:00:00Z', 2500), definitionId: 'steps' },
        ]
        expect(dailySeries(records, new Date('2026-08-20T12:00:00Z'), 1)[0].value).toBe(3500)
        expect(
            dailySeries(
                [
                    observation('early', '2026-08-20T08:00:00Z', 80),
                    observation('latest', '2026-08-20T09:00:00Z', 79),
                ],
                new Date('2026-08-20T12:00:00Z'),
                1,
            )[0].value,
        ).toBe(79)
        expect(
            dailySeries(
                [
                    observation('early', '2026-08-20T08:00:00Z', 80),
                    observation('latest', '2026-08-20T09:00:00Z', 79),
                ],
                new Date('2026-08-20T12:00:00Z'),
                1,
            )[0].recordIds,
        ).toEqual(['latest'])
    })

    it('calculates reproducible timezone-sensitive weekly sums and scalar averages', () => {
        const start = new Date('2026-03-29T12:00:00Z')
        const scalar = [
            observation('one', '2026-03-29T22:30:00Z', 80),
            observation('two', '2026-03-31T08:00:00Z', 78),
        ]
        expect(weeklySeries(scalar, start, 7, 'Europe/Amsterdam')).toEqual([
            {
                date: '2026-03-29 – 2026-04-04',
                value: 79,
                recordIds: ['one', 'two'],
                coveredDays: 2,
                totalDays: 7,
            },
        ])
        const steps = scalar.map(record => ({ ...record, definitionId: 'steps' }))
        expect(weeklySeries(steps, start, 7, 'Europe/Amsterdam')[0].value).toBe(158)
    })

    it('reports deterministic correlation and rejects insufficient samples', () => {
        expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
        expect(pearsonCorrelation([1], [2])).toBeNull()
    })

    it('derives deterministic rolling-baseline deltas without inventing missing values', () => {
        const records = [
            observation('one', '2026-08-18T08:00:00Z', 7),
            observation('two', '2026-08-19T08:00:00Z', 8),
            observation('three', '2026-08-20T08:00:00Z', 9),
        ]
        expect(
            rollingBaselineDelta(records, 'weight', new Date('2026-08-20T12:00:00Z'), 'UTC', 3),
        ).toEqual({ current: 9, baseline: 7.5, delta: 1.5, sampleSize: 2 })
        expect(rollingBaselineDelta(records.slice(2), 'weight', new Date(), 'UTC')).toBeNull()
    })
})
