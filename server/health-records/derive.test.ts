import { describe, expect, it } from 'vitest'
import { deriveRecord } from './derive.js'
import type { CanonicalHealthRecord } from './types.js'

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
            Object.fromEntries(deriveRecord(source).map(item => [item.metric, item.value])),
        ).toMatchObject({
            heart_rate: 230 / 3,
            heart_rate_min: 60,
            heart_rate_max: 100,
            heart_rate_median: 70,
            heart_rate_p95: 97,
            heart_rate_sample_count: 3,
        })
    })

    it('derives versioned sleep stages and compound blood-pressure values', () => {
        const sleep = deriveRecord(
            record('SleepSessionRecord', {
                stages: [
                    { type: 'deep', start: '2026-08-22T23:00:00Z', end: '2026-08-23T01:00:00Z' },
                    { type: 'rem', start: '2026-08-23T01:00:00Z', end: '2026-08-23T02:00:00Z' },
                    { type: 'awake', start: '2026-08-23T02:00:00Z', end: '2026-08-23T02:30:00Z' },
                ],
            }),
        )
        expect(sleep.find(item => item.metric === 'sleep_deep')?.value).toBe(2)
        expect(sleep.every(item => item.derivationVersion === 1)).toBe(true)
        const pressure = deriveRecord(
            record('BloodPressureRecord', {
                systolic: 122,
                diastolic: 76,
                bodyPosition: 'sitting',
            }),
        )
        expect(Object.fromEntries(pressure.map(item => [item.metric, item.value]))).toMatchObject({
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
            { metric: 'exercise', value: 480, unit: 'minutes' },
        ])
    })
})
