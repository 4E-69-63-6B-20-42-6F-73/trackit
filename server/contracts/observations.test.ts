import { describe, expect, it } from 'vitest'
import {
    numericObservationSchema,
    observationRangeQuerySchema,
    parseObservationDefinitionIds,
} from './observations.js'

describe('observation API contract', () => {
    it('parses bounded observation filters', () => {
        const query = observationRangeQuerySchema.parse({
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-09-01T00:00:00.000Z',
            definitionIds: 'steps,weight',
        })

        expect(query).toEqual({
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-09-01T00:00:00.000Z',
            definitionIds: 'steps,weight',
        })
        expect(parseObservationDefinitionIds(query.definitionIds)).toEqual(['steps', 'weight'])
    })

    it('defines the effective numeric observation response', () => {
        expect(
            numericObservationSchema.parse({
                id: 'observation-1',
                definitionId: 'steps',
                canonicalValue: 1000,
                canonicalUnit: 'count',
                originalValue: 1000,
                originalUnit: 'count',
                observedAt: '2026-09-01T08:00:00.000Z',
                excluded: false,
                version: 1,
            }),
        ).toMatchObject({
            id: 'observation-1',
            definitionId: 'steps',
            canonicalValue: 1000,
        })
    })
})
