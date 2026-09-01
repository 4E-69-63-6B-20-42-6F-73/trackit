import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodError } from 'zod'
import {
    dailyMetricRangeQuerySchema,
    observationRangeQuerySchema,
    type DailyMetricRangeQuery,
    type ObservationRangeQuery,
} from '../contracts/observations.js'
import type { DataRepository } from '../data/types.js'
import { observationInputSchema, observationUpdateSchema } from '../data/types.js'

type BadRequest = (
    request: FastifyRequest,
    reply: FastifyReply,
    options?: {
        error?: string
        validation?: ZodError
        includeIssues?: boolean
    },
) => FastifyReply

type ObservationRouteOptions = {
    data: DataRepository
    badRequest: BadRequest
}

export const observationRoutes: FastifyPluginAsync<ObservationRouteOptions> = async (
    app,
    { data, badRequest },
) => {
    app.get<{ Querystring: ObservationRangeQuery }>(
        '/api/observations',
        async (request, reply) => {
            const range = observationRangeQuerySchema.safeParse(request.query)
            if (!range.success)
                return badRequest(request, reply, {
                    error: 'invalid_range',
                    validation: range.error,
                })
            const bounded = { ...range.data }
            if (!bounded.from) {
                const from = new Date()
                from.setUTCDate(from.getUTCDate() - 365)
                bounded.from = from.toISOString()
            }
            bounded.to ??= new Date().toISOString()
            if (
                new Date(bounded.to).getTime() <= new Date(bounded.from).getTime() ||
                new Date(bounded.to).getTime() - new Date(bounded.from).getTime() >
                    366 * 86_400_000
            )
                return badRequest(request, reply, { error: 'range_too_large' })
            return { data: await data.listObservations(bounded) }
        },
    )

    app.get('/api/metric-sources', async () => ({
        data: (await data.listMetricSources?.()) ?? [],
    }))

    app.get<{ Querystring: DailyMetricRangeQuery }>(
        '/api/daily-metrics',
        async (request, reply) => {
            const dateRange = dailyMetricRangeQuerySchema.safeParse(request.query)
            if (!dateRange.success)
                return badRequest(request, reply, { validation: dateRange.error })
            if (!dateRange.data.from || !dateRange.data.to)
                return badRequest(request, reply, { error: 'date_range_required' })
            const days =
                (new Date(`${dateRange.data.to}T00:00:00.000Z`).getTime() -
                    new Date(`${dateRange.data.from}T00:00:00.000Z`).getTime()) /
                86_400_000
            if (days < 0 || days > 365)
                return badRequest(request, reply, { error: 'range_too_large' })
            return { data: (await data.listDailyMetrics?.(dateRange.data)) ?? [] }
        },
    )

    app.post('/api/observations', async (request, reply) => {
        const input = observationInputSchema.safeParse(request.body)
        if (!input.success) return badRequest(request, reply, { validation: input.error })
        return reply.code(201).send({ data: await data.createObservation(input.data) })
    })

    app.patch<{ Params: { id: string } }>('/api/observations/:id', async (request, reply) => {
        const input = observationUpdateSchema.safeParse(request.body)
        if (!input.success) return badRequest(request, reply, { validation: input.error })
        const updated = await data.updateObservation(request.params.id, input.data)
        if (!updated) return reply.code(409).send({ error: 'version_conflict' })
        return { data: updated }
    })
}
