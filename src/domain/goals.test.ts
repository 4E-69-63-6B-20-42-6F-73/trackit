import { describe, expect, it } from 'vitest'
import type { Observation } from './health'
import { evaluateGoal, goalPeriodBounds, validateGoal, type Goal } from './goals'
import { convertMetricValue } from './metrics'

const now = new Date('2026-08-24T12:00:00.000Z')
const weightGoal = (overrides: Partial<Goal> = {}): Goal => ({
    id: 'goal-weight',
    metricId: 'weight',
    aggregation: 'average',
    comparator: 'lte',
    target: { value: 80 },
    period: { type: 'rolling', days: 7 },
    canonicalUnit: 'kg',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    schedule: {},
    ...overrides,
})
const observation = (
    value: number,
    observedAt: string,
    metric = 'weight',
    id = `${metric}-${observedAt}-${value}`,
): Observation => ({
    id,
    definitionId: metric,
    canonicalValue: value,
    canonicalUnit: metric === 'weight' ? 'kg' : metric === 'steps' ? 'count' : 'ml',
    originalValue: value,
    originalUnit: metric === 'weight' ? 'kg' : metric === 'steps' ? 'count' : 'ml',
    observedAt,
    excluded: false,
    version: 1,
})

describe('goal validation', () => {
    it.each([
        ['gte', { value: 80 }],
        ['lte', { value: 80 }],
        ['between', { min: 78, max: 82 }],
    ] as const)('accepts a valid %s goal', (comparator, target) => {
        expect(validateGoal(weightGoal({ comparator, target }))).toEqual([])
    })

    it('rejects invalid ranges, capability combinations, periods, dates, and targets', () => {
        expect(
            validateGoal(weightGoal({ comparator: 'between', target: { min: 83, max: 82 } })),
        ).toContain('Range minimum must be at or below its maximum.')
        expect(validateGoal(weightGoal({ aggregation: 'total' }))).toContain(
            'Aggregation is not supported for this metric.',
        )
        expect(validateGoal(weightGoal({ comparator: 'eq' as Goal['comparator'] }))).toContain(
            'Comparator is not supported for this metric.',
        )
        expect(validateGoal(weightGoal({ period: { type: 'day' } }))).toContain(
            'Period is not supported for this aggregation.',
        )
        expect(validateGoal(weightGoal({ target: { value: Number.NaN } }))).toContain(
            'Target must be a valid number.',
        )
        expect(
            validateGoal(
                weightGoal({
                    effectiveFrom: '2026-08-25T00:00:00.000Z',
                    effectiveTo: '2026-08-24T00:00:00.000Z',
                }),
            ),
        ).toContain('End date must be on or after start date.')
    })
})

describe('goal period and aggregation evaluation', () => {
    it('uses the latest qualifying raw observation', () => {
        const result = evaluateGoal(
            weightGoal({ aggregation: 'latest', period: { type: 'day' } }),
            [
                observation(79, '2026-08-24T08:00:00.000Z'),
                observation(81, '2026-08-24T10:00:00.000Z'),
            ],
            now,
        )
        expect(result.value).toBe(81)
        expect(result.observationCount).toBe(2)
    })

    it('totals additive observations and includes the local day boundary', () => {
        const goal = weightGoal({
            metricId: 'steps',
            aggregation: 'total',
            comparator: 'gte',
            target: { value: 10_000 },
            period: { type: 'day' },
            canonicalUnit: 'count',
        })
        const result = evaluateGoal(
            goal,
            [
                observation(4_000, '2026-08-23T22:30:00.000Z', 'steps'),
                observation(6_000, '2026-08-24T08:00:00.000Z', 'steps'),
                observation(99, '2026-08-23T21:59:59.000Z', 'steps'),
            ],
            now,
            'Europe/Amsterdam',
        )
        expect(result.value).toBe(10_000)
        expect(result.met).toBe(true)
    })

    it('uses Monday as the consistent week boundary', () => {
        const bounds = goalPeriodBounds({ type: 'week' }, now, 'UTC')
        expect(bounds.start.toISOString()).toBe('2026-08-24T00:00:00.000Z')
        expect(bounds.end).toBe(now)
    })

    it('returns an explicit no-data result', () => {
        expect(evaluateGoal(weightGoal(), [], now)).toMatchObject({
            value: null,
            met: null,
            progress: null,
            observationCount: 0,
        })
    })

    it('uses every qualifying observation, including multiple measurements in one day', () => {
        const values = [79, 80, 81, 80].map((value, index) =>
            observation(value, `2026-08-${21 + index}T08:00:00.000Z`),
        )
        expect(evaluateGoal(weightGoal(), values, now)).toMatchObject({
            value: 80,
            met: true,
            observationCount: 4,
        })
    })

    it('evaluates a newly created rolling goal from observations already in its window', () => {
        const result = evaluateGoal(
            weightGoal({ effectiveFrom: '2026-08-24T00:00:00.000Z' }),
            [
                observation(79, '2026-08-21T08:00:00.000Z'),
                observation(81, '2026-08-24T08:00:00.000Z'),
            ],
            now,
        )
        expect(result).toMatchObject({ value: 80, observationCount: 2, met: true })
    })

    it('excludes observations outside a rolling seven-day window', () => {
        const result = evaluateGoal(
            weightGoal(),
            [
                observation(80, '2026-08-17T12:00:00.000Z'),
                observation(100, '2026-08-17T11:59:59.000Z'),
            ],
            now,
        )
        expect(result.value).toBe(80)
        expect(result.observationCount).toBe(1)
    })
})

describe('goal comparisons and units', () => {
    it.each([
        ['gte', 100, 100, true],
        ['gte', 99, 100, false],
        ['lte', 80, 80, true],
        ['lte', 81, 80, false],
    ] as const)('%s compares %s with %s', (comparator, value, target, met) => {
        const result = evaluateGoal(
            weightGoal({
                aggregation: 'latest',
                period: { type: 'day' },
                comparator,
                target: { value: target },
            }),
            [observation(value, '2026-08-24T08:00:00.000Z')],
            now,
        )
        expect(result.met).toBe(met)
    })

    it.each([
        [80, true],
        [77, false],
        [83, false],
    ])('evaluates range membership for %s', (value, met) => {
        const result = evaluateGoal(
            weightGoal({ comparator: 'between', target: { min: 78, max: 82 } }),
            [observation(value, '2026-08-24T08:00:00.000Z')],
            now,
        )
        expect(result.met).toBe(met)
    })

    it('persists pound input as canonical kilograms without changing meaning', () => {
        const canonical = convertMetricValue('weight', 176.369809744, 'lb', 'kg')
        expect(canonical).toBeCloseTo(80, 8)
        expect(convertMetricValue('weight', canonical, 'kg', 'lb')).toBeCloseTo(176.369809744, 8)
    })

    it('reports the required failing weight acceptance case', () => {
        const values = [81, 82, 81, 82].map((value, index) =>
            observation(value, `2026-08-${21 + index}T08:00:00.000Z`),
        )
        expect(evaluateGoal(weightGoal(), values, now)).toMatchObject({
            value: 81.5,
            met: false,
            difference: 1.5,
        })
    })
})
