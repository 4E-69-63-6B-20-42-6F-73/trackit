import { z } from 'zod'
import { observationInputSchema, observationUpdateSchema } from '../data/types.js'

const definitionIds = (value: string) =>
    value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)

export const observationRangeQuerySchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    definitionIds: z
        .string()
        .max(5_050)
        .refine(value => {
            const values = definitionIds(value)
            return values.length <= 50 && values.every(item => item.length <= 100)
        }, 'Invalid definition ids')
        .optional(),
})

export const parseObservationDefinitionIds = (value?: string) =>
    value ? definitionIds(value) : undefined

export const dailyMetricRangeQuerySchema = z.object({
    from: z.string().date(),
    to: z.string().date(),
})

export const observationIdParamsSchema = z.object({
    id: z.string().min(1).max(200),
})

export const errorResponseSchema = z.object({
    error: z.string(),
})

export const numericObservationSchema = z.object({
    id: z.string(),
    definitionId: z.string(),
    canonicalValue: z.number().finite(),
    canonicalUnit: z.string(),
    originalValue: z.number().finite(),
    originalUnit: z.string(),
    observedAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable().optional(),
    sourceId: z.string().nullable().optional(),
    externalId: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
    connector: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    excluded: z.boolean(),
    version: z.number().int().positive(),
})

export const observationListResponseSchema = z.object({
    data: z.array(numericObservationSchema),
})

export const observationMutationResultSchema = z.object({
    id: z.string(),
    version: z.number().int().positive(),
    excluded: z.boolean(),
})

export const observationMutationResponseSchema = z.object({
    data: observationMutationResultSchema,
})

export const metricSourceSummarySchema = z.object({
    definitionId: z.string(),
    provider: z.string(),
    connector: z.string().nullable(),
})

export const metricSourceListResponseSchema = z.object({
    data: z.array(metricSourceSummarySchema),
})

export const dailyMetricSchema = z.object({
    date: z.string().date(),
    definitionId: z.string(),
    value: z.number().finite(),
    unit: z.string(),
    derivationVersion: z.number().int().positive(),
})

export const dailyMetricListResponseSchema = z.object({
    data: z.array(dailyMetricSchema),
})

export type NumericObservationResponse = z.output<typeof numericObservationSchema>
export type ObservationMutationResult = z.output<typeof observationMutationResultSchema>
export type MetricSourceSummary = z.output<typeof metricSourceSummarySchema>
export type DailyMetricResponse = z.output<typeof dailyMetricSchema>

export const observationOpenApiPaths = {
    '/api/observations': {
        get: {
            description:
                'Bounded effective metric series after source resolution and derived metric calculation',
            responses: { '200': { description: 'Effective observations' } },
        },
        post: {
            responses: {
                '201': { description: 'Created' },
                '400': { description: 'Invalid observation' },
            },
        },
    },
    '/api/observations/{id}': {
        patch: {
            responses: {
                '200': { description: 'Updated' },
                '409': { description: 'Conflict' },
            },
        },
        delete: {
            description:
                'Deletes the canonical observation; compound meals also delete their nutrient component observations',
            parameters: [
                {
                    name: 'id',
                    in: 'path',
                    required: true,
                    schema: { type: 'string' },
                },
            ],
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
            responses: {
                '200': {
                    description:
                        'Versioned effective daily metric projections in the owner timezone',
                },
                '400': { description: 'Missing, reversed, or oversized date range' },
            },
        },
    },
    '/api/metric-sources': {
        get: { responses: { '200': { description: 'Distinct metric source summaries' } } },
    },
} as const

export { observationInputSchema, observationUpdateSchema }
