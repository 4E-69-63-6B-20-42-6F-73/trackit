import { describe, expect, it } from 'vitest'
import { observationUpdateSchema } from './types.js'

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
})
