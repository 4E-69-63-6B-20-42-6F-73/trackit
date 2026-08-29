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

const observation = (definitionId: string, value: number, unit: string) =>
    ({
        definitionId,
        value,
        unit,
        kind: 'derived_metric',
        derivation: 'test',
        derivationVersion: 1,
    }) satisfies DerivedObservation

describe('Health record journal projections', () => {
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
        ).toMatchObject({
            category: 'Sleep',
            title: 'Sleep session',
            detail: { projectionVersion: 1, summary: 'Sleep 7.5 hours · Sleep deep 1.2 hours' },
        })
        expect(
            projectHealthRecordToJournal(record('BloodPressureRecord'), [
                observation('blood_pressure_systolic', 122, 'mmHg'),
                observation('blood_pressure_diastolic', 76, 'mmHg'),
            ]),
        ).toMatchObject({ category: 'Measurements', title: 'Blood pressure' })
    })

    it('normalizes provider sleep stages into the Journal projection payload', () => {
        const sleep = {
            ...record('SleepSessionRecord', {
                stages: [
                    {
                        type: 'DEEP',
                        start: '2026-08-22T23:30:00.000Z',
                        end: '2026-08-23T00:15:00.000Z',
                    },
                    {
                        type: 'REM',
                        start: '2026-08-23T00:15:00.000Z',
                        end: '2026-08-23T01:00:00.000Z',
                    },
                ],
            }),
            startTime: new Date('2026-08-22T23:30:00.000Z'),
            endTime: new Date('2026-08-23T07:00:00.000Z'),
        }
        const projected = projectHealthRecordToJournal(sleep, [observation('sleep', 7.5, 'hours')])

        expect(projected?.detail).toMatchObject({
            projectionVersion: 1,
            startedAt: '2026-08-22T23:30:00.000Z',
            endedAt: '2026-08-23T07:00:00.000Z',
            detailView: {
                kind: 'sleep',
                stages: [
                    {
                        type: 'deep',
                        start: '2026-08-22T23:30:00.000Z',
                        end: '2026-08-23T00:15:00.000Z',
                    },
                    {
                        type: 'rem',
                        start: '2026-08-23T00:15:00.000Z',
                        end: '2026-08-23T01:00:00.000Z',
                    },
                ],
            },
        })
    })

    it('preserves a meaningful exercise title', () => {
        expect(
            projectHealthRecordToJournal(
                record('ExerciseSessionRecord', { title: 'Morning run', exerciseType: 'running' }),
                [observation('exercise', 42, 'minutes')],
            ),
        ).toMatchObject({ category: 'Activity', title: 'Morning run' })
        expect(
            projectHealthRecordToJournal(
                record('ExerciseSessionRecord', { exerciseType: 'running' }),
                [observation('exercise', 42, 'minutes')],
            ),
        ).toMatchObject({ category: 'Activity', title: 'Running' })
        expect(
            projectHealthRecordToJournal(
                record('ExerciseSessionRecord', { exerciseType: 'other' }),
                [observation('exercise', 42, 'minutes')],
            ),
        ).toMatchObject({ category: 'Activity', title: 'Exercise' })
    })

    it('does not expose unsupported or empty records', () => {
        expect(projectHealthRecordToJournal(record('UnknownRecord'), [])).toBeNull()
        expect(projectHealthRecordToJournal(record('WeightRecord'), [])).toBeNull()
    })
})
