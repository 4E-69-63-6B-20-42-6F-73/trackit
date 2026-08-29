import { describe, expect, it } from 'vitest'
import type { Observation } from './health'
import { effectiveMetricSeries, observationSource, removeExactDuplicates } from './effectiveMetrics'

const record = (
    overrides: Partial<Observation> & Pick<Observation, 'id' | 'definitionId' | 'canonicalValue'>,
): Observation => ({
    canonicalUnit:
        overrides.definitionId === 'height'
            ? 'cm'
            : overrides.definitionId.includes('calories')
              ? 'kcal'
              : overrides.definitionId === 'steps'
                ? 'count'
                : 'kg',
    originalValue: overrides.canonicalValue,
    originalUnit:
        overrides.definitionId === 'height'
            ? 'cm'
            : overrides.definitionId.includes('calories')
              ? 'kcal'
              : overrides.definitionId === 'steps'
                ? 'count'
                : 'kg',
    observedAt: '2026-08-24T08:00:00.000Z',
    excluded: false,
    version: 1,
    ...overrides,
})

describe('effective metric series', () => {
    it('removes replayed external records but retains legitimate identical readings', () => {
        const replay = record({
            id: 'new',
            definitionId: 'steps',
            canonicalValue: 4200,
            externalId: 'activity-1',
            version: 2,
            metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
        })
        const records = [
            record({ ...replay, id: 'old', version: 1 }),
            replay,
            record({
                id: 'other',
                definitionId: 'steps',
                canonicalValue: 4200,
                metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
            }),
        ]
        expect(
            removeExactDuplicates(records)
                .map(item => item.id)
                .sort(),
        ).toEqual(['new', 'other'])
    })

    it('preserves provider separately from the Health Connect connector', () => {
        expect(
            observationSource(
                record({
                    id: '1',
                    definitionId: 'steps',
                    canonicalValue: 1,
                    metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
                }),
            ),
        ).toEqual({
            key: 'Health Connect::Garmin',
            provider: 'Garmin',
            connector: 'Health Connect',
        })
    })

    it('uses source priority only for overlapping records', () => {
        const garmin = record({
            id: 'garmin',
            definitionId: 'steps',
            canonicalValue: 4200,
            endedAt: '2026-08-24T09:00:00.000Z',
            metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
        })
        const samsung = record({
            id: 'samsung',
            definitionId: 'steps',
            canonicalValue: 4180,
            endedAt: '2026-08-24T09:00:00.000Z',
            metadata: { source: 'Health Connect', dataOrigin: 'Samsung Health' },
        })
        const later = record({
            ...samsung,
            id: 'later',
            observedAt: '2026-08-24T12:00:00.000Z',
            endedAt: '2026-08-24T13:00:00.000Z',
        })
        const effective = effectiveMetricSeries([garmin, samsung, later], {
            steps: {
                displayUnit: 'count',
                deduplication: {
                    policy: 'prefer_priority',
                    sourcePriority: ['Health Connect::Garmin', 'Health Connect::Samsung Health'],
                },
            },
        })
        expect(
            effective
                .filter(item => item.definitionId === 'steps')
                .map(item => item.id)
                .sort(),
        ).toEqual(['garmin', 'later'])
    })

    it('excludes a disabled source from the effective series without changing raw records', () => {
        const raw = [
            record({
                id: 'garmin',
                definitionId: 'steps',
                canonicalValue: 4200,
                metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
            }),
            record({
                id: 'samsung',
                definitionId: 'steps',
                canonicalValue: 4180,
                metadata: { source: 'Health Connect', dataOrigin: 'Samsung Health' },
            }),
        ]
        const effective = effectiveMetricSeries(raw, {
            steps: {
                displayUnit: 'count',
                deduplication: {
                    policy: 'keep_all',
                    sourcePriority: [],
                    disabledSources: ['Health Connect::Garmin'],
                },
            },
        })
        expect(
            effective.filter(item => item.definitionId === 'steps').map(item => item.id),
        ).toEqual(['samsung'])
        expect(raw).toHaveLength(2)
    })

    it('derives BMI from effective weight and height without storing a raw BMI', () => {
        const effective = effectiveMetricSeries([
            record({
                id: 'height',
                definitionId: 'height',
                canonicalValue: 180,
                observedAt: '2026-08-20T08:00:00.000Z',
            }),
            record({ id: 'weight', definitionId: 'weight', canonicalValue: 81 }),
        ])
        const bmi = effective.find(item => item.definitionId === 'bmi')!
        expect(bmi.canonicalValue).toBeCloseTo(25)
        expect(bmi.metadata?.inputRecordIds).toEqual(['weight', 'height'])
    })

    it('derives daily calorie balance from effective intake and expenditure', () => {
        const effective = effectiveMetricSeries([
            record({ id: 'food', definitionId: 'calories', canonicalValue: 2200 }),
            record({ id: 'burn', definitionId: 'active_calories', canonicalValue: 600 }),
        ])
        expect(
            effective.find(item => item.definitionId === 'calorie_balance')?.canonicalValue,
        ).toBe(1600)
    })
})
