import { describe, expect, it } from 'vitest'
import { deriveRecord } from './derive.js'
import type { CanonicalHealthRecord } from './types.js'
import { metricDefinition } from '../../src/domain/metricCatalog.js'

const record = (recordType: string, payload: Record<string, unknown>): CanonicalHealthRecord => ({
    id: 'record',
    userId: 'owner',
    provider: 'health_connect',
    recordType,
    externalId: 'external',
    externalVersion: 1,
    startTime: new Date('2026-08-22T22:00:00Z'),
    endTime: new Date('2026-08-23T06:00:00Z'),
    dataOrigin: 'watch',
    payload,
})

describe('Health Connect record derivation', () => {
    it('preserves dense heart-rate samples as source data and emits deterministic summaries', () => {
        const source = record('HeartRateRecord', {
            samples: [
                { time: '2026-08-23T06:00:00Z', bpm: 60 },
                { time: '2026-08-23T06:01:00Z', bpm: 70 },
                { time: '2026-08-23T06:02:00Z', bpm: 100 },
            ],
        })
        expect(deriveRecord(source)).toEqual(deriveRecord(source))
        expect(source.payload.samples).toHaveLength(3)
        expect(
            Object.fromEntries(deriveRecord(source).map(item => [item.definitionId, item.value])),
        ).toMatchObject({
            heart_rate: 230 / 3,
            heart_rate_min: 60,
            heart_rate_max: 100,
            heart_rate_median: 70,
            heart_rate_p95: 97,
            heart_rate_sample_count: 3,
        })
    })

    it('derives sleep duration from session duration minus awake stages', () => {
        const sleep = deriveRecord(
            record('SleepSessionRecord', {
                stages: [
                    { type: 'deep', start: '2026-08-22T23:00:00Z', end: '2026-08-23T01:00:00Z' },
                    { type: 'rem', start: '2026-08-23T01:00:00Z', end: '2026-08-23T02:00:00Z' },
                    { type: 'awake', start: '2026-08-23T02:00:00Z', end: '2026-08-23T02:30:00Z' },
                ],
            }),
        )
        expect(
            Object.fromEntries(sleep.map(item => [item.definitionId, item.value])),
        ).toMatchObject({
            sleep: 7.5,
            sleep_deep: 2,
            sleep_rem: 1,
            sleep_awake: 0.5,
            sleep_efficiency: 93.75,
        })
        expect(sleep.every(item => item.derivationVersion === 1)).toBe(true)
    })

    it('uses full session duration when no awake stage data is available', () => {
        const sleep = deriveRecord(record('SleepSessionRecord', { stages: [] }))
        expect(
            Object.fromEntries(sleep.map(item => [item.definitionId, item.value])),
        ).toMatchObject({ sleep: 8, sleep_efficiency: 100 })
    })

    it('derives compound blood-pressure values', () => {
        const pressure = deriveRecord(
            record('BloodPressureRecord', {
                systolic: 122,
                diastolic: 76,
                bodyPosition: 'sitting',
            }),
        )
        expect(
            Object.fromEntries(pressure.map(item => [item.definitionId, item.value])),
        ).toMatchObject({
            blood_pressure_systolic: 122,
            blood_pressure_diastolic: 76,
            pulse_pressure: 46,
            map_estimate: 91.33333333333333,
        })
    })

    it('preserves exercise metadata while deriving only record-level duration', () => {
        const source = record('ExerciseSessionRecord', {
            exerciseType: 'running',
            title: 'Morning run',
            segments: [],
            laps: [],
        })
        expect(source.payload).toMatchObject({ exerciseType: 'running', title: 'Morning run' })
        expect(deriveRecord(source)).toMatchObject([
            { definitionId: 'exercise', value: 480, unit: 'minutes' },
        ])
    })

    it('converts provider-native height through Metric Center before creating observations', () => {
        const [height] = deriveRecord(record('HeightRecord', { meters: 1.8 }))
        expect(height).toMatchObject({
            definitionId: 'height',
            value: 180,
            unit: 'cm',
            originalValue: 1.8,
            originalUnit: 'm',
        })
    })

    it('always emits the canonical Metric Center unit for registered numeric projections', () => {
        const inputs = [
            record('HeightRecord', { meters: 1.8 }),
            record('WeightRecord', { kilograms: 81 }),
            record('HydrationRecord', { liters: 0.75 }),
            record('DistanceRecord', { meters: 1200 }),
            record('ActiveCaloriesBurnedRecord', { kilocalories: 300 }),
            record('BodyFatRecord', { percentage: 18 }),
            record('Vo2MaxRecord', { millilitersPerMinuteKilogram: 42 }),
        ]
        for (const projection of inputs.flatMap(deriveRecord)) {
            const definition = metricDefinition(projection.definitionId)
            expect(definition, projection.definitionId).toBeDefined()
            expect(projection.unit, projection.definitionId).toBe(definition!.canonicalUnit)
        }
    })
})
