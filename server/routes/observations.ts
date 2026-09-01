import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { DataRepository } from '../data/types.js'
import { observationInputSchema, observationUpdateSchema } from '../data/types.js'

const recordRangeSchema = z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    definitionIds: z
        .string()
        .transform(value => value.split(',').filter(Boolean))
        .pipe(z.array(z.string().trim().min(1).max(100)).max(50))
        .optional(),
})

const dailyMetricRangeSchema = z.object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
})

type BadRequest = (
    request: FastifyRequest,
    reply: FastifyReply,
    options?: {
        error?: string
        validation?: z.ZodError
        includeIssues?: boolean
    },
) => FastifyReply

export async function registerObservationRoutes(
    app: FastifyInstance,
    options: { data: DataRepository; badRequest: BadRequest },
) {
    const { data, badRequest } = options

    app.get<{ Querystring: { from?: string; to?: string; definitionIds?: string } }>(
        '/api/observations',
        async (request, reply) => {
            const range = recordRangeSchema.safeParse(request.query)
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

    app.get<{ Querystring: { from?: string; to?: string } }>(
        '/api/daily-metrics',
        async (request, reply) => {
            const dateRange = dailyMetricRangeSchema.safeParse(request.query)
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
