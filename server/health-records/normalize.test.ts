import { describe, expect, it } from 'vitest'
import {
    normalizeExerciseType,
    normalizeHealthRecord,
    normalizeHealthRecordInput,
} from './normalize.js'

describe('Health record normalization', () => {
    it('maps Health Connect exercise integers to canonical exercise types', () => {
        expect(normalizeExerciseType('health_connect', 56)).toBe('running')
        expect(normalizeExerciseType('health_connect', 70)).toBe('strength_training')
        expect(normalizeExerciseType('health_connect', 79)).toBe('walking')
        expect(normalizeExerciseType('health_connect', 999)).toBe('other')
    })

    it('accepts canonical exercise strings from any connector', () => {
        expect(normalizeExerciseType('future_connector', 'running')).toBe('running')
        expect(normalizeExerciseType('future_connector', 'strength-training')).toBe(
            'strength_training',
        )
        expect(normalizeExerciseType('future_connector', 'unknown_activity')).toBe('other')
    })

    it('normalizes exercise payloads before they enter the canonical record model', () => {
        const normalized = normalizeHealthRecordInput({
            provider: 'health_connect',
            recordType: 'ExerciseSessionRecord',
            externalId: 'exercise',
            externalVersion: 1,
            startTime: '2026-08-23T08:00:00Z',
            endTime: '2026-08-23T08:42:00Z',
            payload: {
                exerciseType: 56,
                title: 'Morning run',
                notes: 'Easy pace',
                segments: [],
                laps: [],
            },
        })

        expect(normalized.payload).toEqual({
            exerciseType: 'running',
            title: 'Morning run',
            notes: 'Easy pace',
            segments: [],
            laps: [],
        })
    })

    it('normalizes legacy stored records from their connector', () => {
        const normalized = normalizeHealthRecord({
            id: 'record-id',
            userId: 'owner',
            connector: 'health_connect',
            provider: 'com.example.watch',
            recordType: 'ExerciseSessionRecord',
            externalId: 'exercise',
            externalVersion: 1,
            startTime: new Date('2026-08-23T08:00:00Z'),
            endTime: new Date('2026-08-23T08:42:00Z'),
            payload: { exerciseType: 56 },
        })

        expect(normalized.payload).toEqual({ exerciseType: 'running' })
    })

    it('leaves non-exercise payloads unchanged', () => {
        const payload = { kilograms: 81.2 }
        const normalized = normalizeHealthRecordInput({
            provider: 'health_connect',
            recordType: 'WeightRecord',
            externalId: 'weight',
            externalVersion: 1,
            startTime: '2026-08-23T08:00:00Z',
            payload,
        })

        expect(normalized.payload).toBe(payload)
    })
})
