import { z } from 'zod'
import {
    goalInputSchema,
    goalUpdateSchema,
    preferencesInputSchema,
    savedTrendViewInputSchema,
} from '../data/types.js'

const dataResponse = <T extends z.ZodType>(schema: T) => z.object({ data: schema })

const metricPreferenceSchema = z.object({
    displayUnit: z.string(),
    precision: z.number().int().optional(),
    showInJournal: z.boolean().optional(),
    deduplication: z
        .object({
            policy: z.enum(['keep_all', 'prefer_priority', 'metric_merge']),
            sourcePriority: z.array(z.string()),
            disabledSources: z.array(z.string()).optional(),
        })
        .optional(),
})

export const preferencesRecordSchema = z.object({
    id: z.string(),
    displayName: z.string(),
    timezone: z.string(),
    locale: z.string(),
    metricPreferences: z.record(z.string(), metricPreferenceSchema),
    metricResolutionVersion: z.number().int(),
    mcpEnabled: z.boolean(),
    mcpAllowedOrigins: z.array(z.string()),
    experience: z.record(z.string(), z.unknown()),
    updatedAt: z.string().datetime(),
})

const goalTargetSchema = z.union([
    z.object({ value: z.number() }),
    z.object({ min: z.number(), max: z.number() }),
])

const goalPeriodSchema = z.union([
    z.object({ type: z.literal('day') }),
    z.object({ type: z.literal('week') }),
    z.object({
        type: z.literal('rolling'),
        days: z.union([z.literal(7), z.literal(14), z.literal(30)]),
    }),
])

export const goalRecordSchema = z.object({
    id: z.string().uuid(),
    definitionId: z.string(),
    aggregation: z.enum(['latest', 'average', 'total']),
    comparator: z.enum(['gte', 'lte', 'between']),
    target: goalTargetSchema,
    period: goalPeriodSchema,
    canonicalUnit: z.string(),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().nullable(),
    schedule: z.object({ weekdays: z.array(z.number().int()).optional() }),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
})

export const goalEvaluationSchema = z.object({
    value: z.number().nullable(),
    met: z.boolean().nullable(),
    progress: z.number().nullable(),
    observationCount: z.number().int(),
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    difference: z.number().nullable(),
})

export const savedTrendViewRecordSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    definitionId: z.string(),
    comparisonDefinitionId: z.string().nullable(),
    rangeDays: z.number().int(),
    granularity: z.enum(['daily', 'weekly']),
    createdAt: z.string().datetime(),
})

export const appDataContractSchemas = {
    preferencesInput: preferencesInputSchema,
    preferencesResponse: dataResponse(preferencesRecordSchema),
    goalInput: goalInputSchema,
    goalUpdate: goalUpdateSchema,
    goalResponse: dataResponse(goalRecordSchema),
    goalsResponse: dataResponse(z.array(goalRecordSchema)),
    goalEvaluationsResponse: dataResponse(z.record(z.string(), goalEvaluationSchema)),
    savedTrendViewInput: savedTrendViewInputSchema,
    savedTrendViewResponse: dataResponse(savedTrendViewRecordSchema),
    savedTrendViewsResponse: dataResponse(z.array(savedTrendViewRecordSchema)),
    errorResponse: z.object({ error: z.string() }),
} as const
