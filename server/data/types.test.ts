import { describe, expect, it } from 'vitest'
import { mealUpdateSchema, observationUpdateSchema } from './types.js'

describe('observation update schema', () => {
    it('keeps Journal detail edits for observation persistence', () => {
        expect(
            observationUpdateSchema.parse({
                title: 'Updated entry',
                detail: 'Updated Journal detail',
                version: 2,
            }),
        ).toEqual({
            title: 'Updated entry',
            detail: 'Updated Journal detail',
            version: 2,
        })
    })

    it('accepts updated or cleared meal serving snapshots', () => {
        expect(
            mealUpdateSchema.parse({
                serving: { amount: 200, unit: 'g' },
                version: 3,
            }),
        ).toEqual({ serving: { amount: 200, unit: 'g' }, version: 3 })
        expect(mealUpdateSchema.parse({ serving: null, version: 3 })).toEqual({
            serving: null,
            version: 3,
        })
    })
})
