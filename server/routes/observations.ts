import swagger from '@fastify/swagger'
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodError } from 'zod'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import {
    jsonSchemaTransform,
    serializerCompiler,
    validatorCompiler,
} from 'fastify-type-provider-zod'
import {
    type DailyMetricResponse,
    dailyMetricListResponseSchema,
    dailyMetricRangeQuerySchema,
    errorResponseSchema,
    metricSourceListResponseSchema,
    type NumericObservationResponse,
    observationIdParamsSchema,
    observationInputSchema,
    observationListResponseSchema,
    type ObservationMutationResult,
    observationMutationResponseSchema,
    observationRangeQuerySchema,
    observationUpdateSchema,
    parseObservationDefinitionIds,
} from '../contracts/observations.js'
import type { HealthProjectionRepository, ObservationRepository } from '../data/types.js'
import { mergeGeneratedObservationPaths, openApiContract } from '../openapi.js'

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
    data: ObservationRepository & HealthProjectionRepository
    badRequest: BadRequest
}

const mutationResult = (
    value: unknown,
    defaults?: Pick<ObservationMutationResult, 'version' | 'excluded'>,
): ObservationMutationResult => {
    const record = value as { id: string; version?: number; excluded?: boolean }
    return {
        id: record.id,
        version: record.version ?? defaults?.version ?? 1,
        excluded: record.excluded ?? defaults?.excluded ?? false,
    }
}

export const observationRoutes: FastifyPluginAsync<ObservationRouteOptions> = async (
    app,
    { data, badRequest },
) => {
    app.setValidatorCompiler(validatorCompiler)
    app.setSerializerCompiler(serializerCompiler)
    await app.register(swagger, {
        openapi: {
            info: openApiContract.info,
            servers: [...openApiContract.servers],
        },
        transform: jsonSchemaTransform,
    })

    const routes = app.withTypeProvider<ZodTypeProvider>()

    routes.get(
        '/api/observations',
        {
            attachValidation: true,
            schema: {
                querystring: observationRangeQuerySchema,
                response: {
                    200: observationListResponseSchema,
                    400: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            if (request.validationError)
                return badRequest(request, reply, { error: 'invalid_range' })
            const bounded: {
                from?: string
                to?: string
                definitionIds?: string[]
            } = {
                from: request.query.from,
                to: request.query.to,
                definitionIds: parseObservationDefinitionIds(request.query.definitionIds),
            }
            if (!bounded.from) {
                const from = new Date()
                from.setUTCDate(from.getUTCDate() - 365)
                bounded.from = from.toISOString()
            }
            bounded.to ??= new Date().toISOString()
            if (
                new Date(bounded.to).getTime() <= new Date(bounded.from).getTime() ||
                new Date(bounded.to).getTime() - new Date(bounded.from).getTime() > 366 * 86_400_000
            )
                return badRequest(request, reply, { error: 'range_too_large' })
            return {
                data: (await data.listObservations(bounded)) as NumericObservationResponse[],
            }
        },
    )

    routes.get(
        '/api/metric-sources',
        {
            schema: {
                response: {
                    200: metricSourceListResponseSchema,
                },
            },
        },
        async () => ({
            data: await data.listMetricSources(),
        }),
    )

    routes.get(
        '/api/daily-metrics',
        {
            attachValidation: true,
            schema: {
                querystring: dailyMetricRangeQuerySchema,
                response: {
                    200: dailyMetricListResponseSchema,
                    400: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            if (request.validationError) return badRequest(request, reply)
            if (!request.query.from || !request.query.to)
                return badRequest(request, reply, { error: 'date_range_required' })
            const days =
                (new Date(`${request.query.to}T00:00:00.000Z`).getTime() -
                    new Date(`${request.query.from}T00:00:00.000Z`).getTime()) /
                86_400_000
            if (days < 0 || days > 365)
                return badRequest(request, reply, { error: 'range_too_large' })
            const rows = await data.listDailyMetrics({
                from: request.query.from,
                to: request.query.to,
            })
            return {
                data: rows.map((row): DailyMetricResponse => ({
                    date: row.date,
                    definitionId: row.definitionId,
                    value: row.value,
                    unit: row.unit,
                    derivationVersion: row.derivationVersion,
                })),
            }
        },
    )

    routes.post(
        '/api/observations',
        {
            attachValidation: true,
            schema: {
                body: observationInputSchema,
                response: {
                    201: observationMutationResponseSchema,
                    400: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            if (request.validationError) return badRequest(request, reply)
            const created = await data.createObservation(request.body)
            if (!created) return reply.code(409).send({ error: 'observation_conflict' })
            return reply
                .code(201)
                .send({ data: mutationResult(created, { version: 1, excluded: false }) })
        },
    )

    routes.patch(
        '/api/observations/:id',
        {
            attachValidation: true,
            schema: {
                params: observationIdParamsSchema,
                body: observationUpdateSchema,
                response: {
                    200: observationMutationResponseSchema,
                    400: errorResponseSchema,
                    409: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            if (request.validationError) return badRequest(request, reply)
            const updated = await data.updateObservation(request.params.id, request.body)
            if (!updated) return reply.code(409).send({ error: 'version_conflict' })
            return { data: mutationResult(updated) }
        },
    )

    app.addHook('onReady', async () => {
        mergeGeneratedObservationPaths(
            app.swagger() as unknown as {
                paths?: Record<string, Record<string, unknown>>
            },
        )
    })
}
