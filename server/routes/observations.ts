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
    dailyMetricListResponseSchema,
    dailyMetricRangeQuerySchema,
    errorResponseSchema,
    metricSourceListResponseSchema,
    type MetricSourceSummary,
    numericObservationSchema,
    type NumericObservationResponse,
    observationIdParamsSchema,
    observationInputSchema,
    observationListResponseSchema,
    observationRangeQuerySchema,
    observationUpdateSchema,
    parseObservationDefinitionIds,
    unknownDataResponseSchema,
} from '../contracts/observations.js'
import type { DataRepository } from '../data/types.js'
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
    data: DataRepository
    badRequest: BadRequest
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
            servers: openApiContract.servers,
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
                new Date(bounded.to).getTime() - new Date(bounded.from).getTime() >
                    366 * 86_400_000
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
            data: ((await data.listMetricSources?.()) ?? []) as MetricSourceSummary[],
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
            return {
                data: (await data.listDailyMetrics?.({
                    from: request.query.from,
                    to: request.query.to,
                })) ?? [],
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
                    201: unknownDataResponseSchema,
                    400: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            if (request.validationError) return badRequest(request, reply)
            return reply.code(201).send({ data: await data.createObservation(request.body) })
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
                    200: unknownDataResponseSchema,
                    400: errorResponseSchema,
                    409: errorResponseSchema,
                },
            },
        },
        async (request, reply) => {
            if (request.validationError) return badRequest(request, reply)
            const updated = await data.updateObservation(request.params.id, request.body)
            if (!updated) return reply.code(409).send({ error: 'version_conflict' })
            return { data: updated }
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
