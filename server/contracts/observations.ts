import { z } from 'zod'
import { observationInputSchema, observationUpdateSchema } from '../data/types.js'

export const observationRangeQuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    definitionIds: z
        .string()
        .transform(value => value.split(',').filter(Boolean))
        .pipe(z.array(z.string().trim().min(1).max(100)).max(50))
        .optional(),
})

export const dailyMetricRangeQuerySchema = z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
})

export type ObservationRangeQuery = z.input<typeof observationRangeQuerySchema>
export type DailyMetricRangeQuery = z.input<typeof dailyMetricRangeQuerySchema>
export type CreateObservationBody = z.input<typeof observationInputSchema>
export type UpdateObservationBody = z.input<typeof observationUpdateSchema>

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema)

export const observationOpenApiPaths = {
    '/api/observations': {
        get: {
            description:
                'Bounded effective metric series after source resolution and derived metric calculation',
            parameters: [
                {
                    name: 'from',
                    in: 'query',
                    schema: { type: 'string', format: 'date-time' },
                },
                {
                    name: 'to',
                    in: 'query',
                    schema: { type: 'string', format: 'date-time' },
                },
                {
                    name: 'definitionIds',
                    in: 'query',
                    schema: { type: 'string' },
                },
            ],
            responses: { '200': { description: 'Effective observations' } },
        },
        post: {
            requestBody: {
                required: true,
                content: {
                    'application/json': { schema: jsonSchema(observationInputSchema) },
                },
            },
            responses: {
                '201': { description: 'Created' },
                '400': { description: 'Invalid observation' },
            },
        },
    },
    '/api/observations/{id}': {
        patch: {
            parameters: [
                {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                },
            ],
            requestBody: {
                required: true,
                content: {
                    'application/json': { schema: jsonSchema(observationUpdateSchema) },
                },
            },
            responses: {
                '200': { description: 'Updated' },
                '409': { description: 'Conflict' },
            },
        },
        delete: {
            description:
                'Deletes the canonical observation; compound meals also delete their nutrient component observations',
            responses: {
                '204': { description: 'Deleted' },
                '404': { description: 'Observation not found' },
            },
        },
    },
    '/api/daily-metrics': {
        get: {
            description:
                'Requires inclusive owner-local from/to dates with a maximum 366-day window',
            parameters: [
                { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
                { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
            ],
            responses: {
                '200': {
                    description: 'Versioned effective daily metric projections in the owner timezone',
                },
                '400': { description: 'Missing, reversed, or oversized date range' },
            },
        },
    },
    '/api/metric-sources': {
        get: { responses: { '200': { description: 'Distinct metric source summaries' } } },
    },
} as const
