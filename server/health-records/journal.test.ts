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
    it('does not expose passive interval or dense time-series records', () => {
        expect(
            projectHealthRecordToJournal(record('HeartRateRecord'), [
                observation('heart_rate', 72, 'bpm'),
            ]),
        ).toBeNull()
        expect(
            projectHealthRecordToJournal(record('StepsRecord'), [
                observation('steps', 12, 'count'),
            ]),
        ).toBeNull()
        expect(
            projectHealthRecordToJournal(record('ActiveCaloriesBurnedRecord'), [
                observation('active_calories', 4, 'kcal'),
            ]),
        ).toBeNull()
    })

    it('keeps meaningful sessions and intentional measurements', () => {
        expect(
            projectHealthRecordToJournal(record('SleepSessionRecord'), [
                observation('sleep', 7.5, 'hours'),
                observation('sleep_deep', 1.2, 'hours'),
            ]),
        ).toMatchObject({ category: 'Sleep', title: 'Sleep session' })
        expect(
            projectHealthRecordToJournal(record('BloodPressureRecord'), [
                observation('blood_pressure_systolic', 122, 'mmHg'),
                observation('blood_pressure_diastolic', 76, 'mmHg'),
            ]),
        ).toMatchObject({ category: 'Measurements', title: 'Blood pressure' })
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
