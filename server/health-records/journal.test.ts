import { describe, expect, it } from 'vitest'
import { projectHealthRecordToJournal } from './journal.js'
import type { CanonicalHealthRecord, DerivedObservation } from './types.js'

const record = (recordType: string, payload: Record<string, unknown> = {}) =>
    ({
        id: 'record-id',
        userId: 'owner',
        provider: 'health_connect',
        recordType,
        externalId: 'external-id',
        externalVersion: 1,
        startTime: new Date('2026-08-23T08:00:00Z'),
        endTime: null,
        payload,
    }) satisfies CanonicalHealthRecord

const observation = (metric: string, value: number, unit: string) =>
    ({
        metric,
        value,
        unit,
        kind: 'derived_metric',
        derivation: 'test',
        derivationVersion: 1,
    }) satisfies DerivedObservation

describe('Health Connect journal projections', () => {
    it('summarizes a dense heart-rate record into one useful entry', () => {
        const projection = projectHealthRecordToJournal(record('HeartRateRecord'), [
            observation('heart_rate', 72, 'bpm'),
            observation('heart_rate_min', 58, 'bpm'),
            observation('heart_rate_max', 101, 'bpm'),
            observation('heart_rate_sample_count', 900, 'count'),
        ])

        expect(projection).toEqual({
            category: 'Measurements',
            title: 'Heart rate',
            detail: 'Heart rate 72 bpm · Heart rate min 58 bpm · Heart rate max 101 bpm',
        })
    })

    it('preserves a meaningful exercise title', () => {
        expect(
            projectHealthRecordToJournal(
                record('ExerciseSessionRecord', { title: 'Morning run' }),
                [observation('exercise', 42, 'min')],
            ),
        ).toMatchObject({ category: 'Activity', title: 'Morning run' })
    })

    it('does not expose unsupported or empty records', () => {
        expect(projectHealthRecordToJournal(record('UnknownRecord'), [])).toBeNull()
        expect(projectHealthRecordToJournal(record('WeightRecord'), [])).toBeNull()
    })
})
