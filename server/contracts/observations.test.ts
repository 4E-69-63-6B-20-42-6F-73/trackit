import { describe, expect, it } from 'vitest'
import { observationOpenApiPaths, observationRangeQuerySchema } from './observations.js'

describe('observation API contract', () => {
    it('parses bounded observation filters', () => {
        expect(
            observationRangeQuerySchema.parse({
                from: '2026-08-01T00:00:00.000Z',
                to: '2026-09-01T00:00:00.000Z',
                definitionIds: 'steps,weight',
            }),
        ).toEqual({
            from: '2026-08-01T00:00:00.000Z',
            to: '2026-09-01T00:00:00.000Z',
            definitionIds: ['steps', 'weight'],
        })
    })

    it('publishes the same observation body schema through OpenAPI', () => {
        const schema =
            observationOpenApiPaths['/api/observations'].post.requestBody.content[
                'application/json'
            ].schema

        expect(schema).toMatchObject({
            type: 'object',
            properties: {
                definitionId: { type: 'string' },
                observedAt: { type: 'string', format: 'date-time' },
                valueType: {},
            },
        })
    })
})
