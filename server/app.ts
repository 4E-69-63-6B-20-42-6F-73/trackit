import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { AuthService } from './auth/service.js'
import type { DataRepository } from './data/types.js'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from './db/schema.js'
import {
    foodInputSchema,
    foodImportSchema,
    foodUpdateSchema,
    goalInputSchema,
    goalUpdateSchema,
    mealInputSchema,
    mealUpdateSchema,
    observationInputSchema,
    observationUpdateSchema,
    preferencesInputSchema,
    recipeInputSchema,
    recipeUpdateSchema,
    savedTrendViewInputSchema,
} from './data/types.js'
import type { JournalRepository } from './journal/types.js'
import { openApiContract } from './openapi.js'
import type { McpAccessService } from './mcp/service.js'
import { createTrackItMcpServer } from './mcp/server.js'
import type { DeviceService, DeviceUploadRecord } from './devices/service.js'
import type { CanonicalHealthRecordInput } from './health-records/types.js'
import type { DataDeletionService } from './data-lifecycle/deletion.js'
import { ExportService } from './data-lifecycle/export.js'
import type { FoodCatalogService } from './nutrition/catalog.js'
import { config } from './config.js'
import { evaluateGoal, type Goal } from '../src/domain/goals.js'
import type { NumericObservation } from '../src/domain/health.js'

export async function createApp(
    repository: JournalRepository,
    options?: {
        logger?: boolean
        dataRepository?: DataRepository
        auth?: AuthService
        mcp?: McpAccessService
        devices?: DeviceService
        deletion?: DataDeletionService
        trustProxy?: boolean
        bootstrapSecret?: string
        database?: PostgresJsDatabase<typeof schemaType>
        foodCatalog?: FoodCatalogService
    },
) {
    const app = Fastify({
        logger: options?.logger
            ? {
                  redact: {
                      paths: [
                          'req.headers.authorization',
                          'req.headers.cookie',
                          'res.headers.set-cookie',
                          '*.password',
                          '*.credential',
                          '*.token',
                          '*.recoveryCodes',
                      ],
                      censor: '[REDACTED]',
                  },
              }
            : false,
        requestIdHeader: 'x-request-id',
        trustProxy: options?.trustProxy ?? false,
    })

    const rawJsonBodies = new WeakMap<FastifyRequest, Buffer>()
    const secureJsonParser = app.getDefaultJsonParser('error', 'error')
    app.removeContentTypeParser('application/json')
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
        const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body)
        rawJsonBodies.set(request, rawBody)
        secureJsonParser(request, rawBody.toString('utf8'), done)
    })

    const requestBodyHash = (request: FastifyRequest) =>
        createHash('sha256')
            .update(
                rawJsonBodies.get(request) ??
                    Buffer.from(JSON.stringify(request.body ?? null), 'utf8'),
            )
            .digest('hex')

    await app.register(cookie)
    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", 'data:'],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
            },
        },
    })
    await app.register(cors, { origin: false })
    await app.register(rateLimit, { max: config.API_RATE_LIMIT_MAX, timeWindow: '1 minute' })

    const badRequest = (
        request: FastifyRequest,
        reply: FastifyReply,
        options?: {
            error?: string
            validation?: z.ZodError
            includeIssues?: boolean
        },
    ) => {
        const responseError = options?.error ?? 'invalid_request'
        const issues = options?.validation?.issues.map(issue => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: issue.message,
        }))

        request.log.warn(
            {
                requestId: request.id,
                method: request.method,
                url: request.url,
                reason: responseError,
                issues,
            },
            'bad request',
        )

        return reply
            .code(400)
            .send(
                options?.includeIssues && issues
                    ? { error: responseError, issues }
                    : { error: responseError },
            )
    }

    const passwordSchema = z.object({ password: z.string().min(12).max(256) })
    const publicPaths = new Set([
        '/api/health',
        '/api/ready',
        '/api/openapi.json',
        '/api/auth/status',
        '/api/auth/setup',
        '/api/auth/login',
        '/api/auth/recover',
        '/api/auth/passkey/authenticate/options',
        '/api/auth/passkey/authenticate/verify',
        '/mcp',
        '/api/devices/pair/request',
        '/api/device/status',
        '/api/device/upload',
        '/api/device/health-records',
        '/api/device/cursor',
    ])
    const sessionCookie = 'trackit_session'
    const csrfCookie = 'trackit_csrf'
    const authBrowserCookie = 'trackit_auth_browser'
    const browserBinding = (
        request: { cookies: Record<string, string | undefined> },
        reply: FastifyReply,
    ) => {
        const existing = request.cookies[authBrowserCookie]
        if (existing) return existing
        const value = randomBytes(32).toString('base64url')
        reply.setCookie(authBrowserCookie, value, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/api/auth/passkey',
            maxAge: 10 * 60,
        })
        return value
    }
    const setSession = (reply: FastifyReply, session: { token: string; expiresAt: Date }) => {
        const secure = process.env.NODE_ENV === 'production'
        reply.setCookie(sessionCookie, session.token, {
            httpOnly: true,
            secure,
            sameSite: 'strict',
            path: '/',
            expires: session.expiresAt,
        })
        reply.setCookie(csrfCookie, randomBytes(24).toString('base64url'), {
            httpOnly: false,
            secure,
            sameSite: 'strict',
            path: '/',
            expires: session.expiresAt,
        })
    }

    if (options?.auth) {
        const auth = options.auth
        app.addHook('onRequest', async (request, reply) => {
            const path = request.url.split('?')[0]
            if (!path.startsWith('/api/') && path !== '/mcp') return
            if (publicPaths.has(path)) return
            const session = await auth.authenticate(request.cookies[sessionCookie])
            if (!session) return reply.code(401).send({ error: 'unauthorized' })
            if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
                const header = request.headers['x-csrf-token']
                if (!header || header !== request.cookies[csrfCookie]) {
                    return reply.code(403).send({ error: 'invalid_csrf_token' })
                }
            }
        })

        app.get('/api/auth/status', async request => ({
            configured: await auth.configured(),
            authenticated: Boolean(await auth.authenticate(request.cookies[sessionCookie])),
        }))
        app.post('/api/auth/setup', async (request, reply) => {
            const suppliedSecret = request.headers['x-trackit-bootstrap-secret']
            if (!options.bootstrapSecret) {
                return reply.code(503).send({ error: 'bootstrap_not_configured' })
            }
            if (
                typeof suppliedSecret !== 'string' ||
                suppliedSecret.length !== options.bootstrapSecret.length ||
                !Buffer.from(suppliedSecret).equals(Buffer.from(options.bootstrapSecret))
            ) {
                return reply.code(403).send({ error: 'invalid_bootstrap_secret' })
            }
            const input = passwordSchema.safeParse(request.body)
            if (!input.success)
                return badRequest(request, reply, {
                    error: 'invalid_password',
                    validation: input.error,
                })
            try {
                const result = await auth.setup(input.data.password, {
                    userAgent: request.headers['user-agent'],
                    ipAddress: request.ip,
                })
                setSession(reply, result.session)
                return reply.code(201).send({ recoveryCodes: result.recoveryCodes })
            } catch {
                return reply.code(409).send({ error: 'already_configured' })
            }
        })
        app.post(
            '/api/auth/login',
            { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
            async (request, reply) => {
                const input = passwordSchema.safeParse(request.body)
                if (!input.success) return badRequest(request, reply, { validation: input.error })
                const session = await auth.login(input.data.password, {
                    userAgent: request.headers['user-agent'],
                    ipAddress: request.ip,
                })
                if (!session) return reply.code(401).send({ error: 'invalid_credentials' })
                setSession(reply, session)
                return { status: 'ok' }
            },
        )
        app.post(
            '/api/auth/recover',
            { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
            async (request, reply) => {
                const input = z.object({ code: z.string().min(12).max(32) }).safeParse(request.body)
                if (!input.success) return badRequest(request, reply, { validation: input.error })
                const session = await auth.recover(input.data.code, {
                    userAgent: request.headers['user-agent'],
                    ipAddress: request.ip,
                })
                if (!session) return reply.code(401).send({ error: 'invalid_recovery_code' })
                setSession(reply, session)
                return { status: 'ok' }
            },
        )
        app.post('/api/auth/passkey/register/options', async (request, reply) =>
            auth.registrationOptions(browserBinding(request, reply)),
        )
        app.post('/api/auth/passkey/register/verify', async (request, reply) => {
            const input = z
                .object({ attemptId: z.string().uuid(), response: z.unknown() })
                .safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            const verified = await auth.registerPasskey(
                input.data.response as RegistrationResponseJSON,
                input.data.attemptId,
                browserBinding(request, reply),
            )
            if (!verified) return badRequest(request, reply, { error: 'verification_failed' })
            return { verified: true }
        })
        app.post('/api/auth/passkey/authenticate/options', async (request, reply) =>
            auth.authenticationOptions(browserBinding(request, reply)),
        )
        app.post('/api/auth/passkey/authenticate/verify', async (request, reply) => {
            const input = z
                .object({ attemptId: z.string().uuid(), response: z.unknown() })
                .safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            const session = await auth.authenticatePasskey(
                input.data.response as AuthenticationResponseJSON,
                {
                    userAgent: request.headers['user-agent'],
                    ipAddress: request.ip,
                },
                input.data.attemptId,
                browserBinding(request, reply),
            )
            if (!session) return reply.code(401).send({ error: 'verification_failed' })
            setSession(reply, session)
            return { status: 'ok' }
        })
        app.post('/api/auth/logout', async (request, reply) => {
            await auth.revoke(request.cookies[sessionCookie])
            reply.clearCookie(sessionCookie, { path: '/' })
            reply.clearCookie(csrfCookie, { path: '/' })
            return reply.code(204).send()
        })
        app.post('/api/auth/logout-all', async (_request, reply) => {
            await auth.revokeAll()
            reply.clearCookie(sessionCookie, { path: '/' })
            reply.clearCookie(csrfCookie, { path: '/' })
            return reply.code(204).send()
        })
        app.get('/api/auth/sessions', async request => {
            const current = await auth.authenticate(request.cookies[sessionCookie])
            const active = await auth.listSessions()
            return {
                data: active.map(session => ({ ...session, current: session.id === current?.id })),
            }
        })
        app.delete<{ Params: { id: string } }>('/api/auth/sessions/:id', async (request, reply) => {
            await auth.revokeSession(request.params.id)
            return reply.code(204).send()
        })
        app.get('/api/auth/audit', async () => ({ data: await auth.listAuditEvents() }))
    }

    app.get('/api/health', async () => ({ status: 'ok' }))
    app.get('/api/openapi.json', async () => openApiContract)

    if (options?.dataRepository) {
        const exports = new ExportService(options.dataRepository, repository)
        app.get<{ Querystring: { format?: string } }>('/api/export', async (request, reply) => {
            const format = request.query.format === 'csv' ? 'csv' : 'json'
            await options.auth?.recordAudit('data.exported', 'format', format)
            reply.header(
                'content-disposition',
                `attachment; filename="trackit-export-v1.${format}"`,
            )
            if (format === 'csv') {
                reply.type('text/csv; charset=utf-8')
                return exports.csv()
            }
            return exports.snapshot()
        })
    }

    if (options?.deletion) {
        const deletion = options.deletion
        app.get<{ Querystring: { category?: string } }>(
            '/api/data-summary',
            async (request, reply) => {
                const category = z
                    .enum(['observations', 'meals', 'checkins'])
                    .safeParse(request.query.category)
                if (!category.success)
                    return badRequest(request, reply, { validation: category.error })
                return { data: await deletion.categorySummary(category.data) }
            },
        )
        app.delete<{ Params: { category: string } }>(
            '/api/data/:category',
            async (request, reply) => {
                const category = z
                    .enum(['observations', 'meals', 'checkins'])
                    .safeParse(request.params.category)
                if (!category.success)
                    return badRequest(request, reply, {
                        error: 'invalid_category',
                        validation: category.error,
                    })
                await deletion.deleteCategory(category.data)
                return reply.code(204).send()
            },
        )
        app.post('/api/data/delete-owner', async (request, reply) => {
            const input = z
                .object({ confirmation: z.literal('DELETE ALL TRACKIT DATA') })
                .safeParse(request.body)
            if (!input.success)
                return badRequest(request, reply, {
                    error: 'confirmation_required',
                    validation: input.error,
                })
            await deletion.deleteOwnerData()
            reply.clearCookie(sessionCookie, { path: '/' })
            reply.clearCookie(csrfCookie, { path: '/' })
            return reply.code(204).send()
        })
    }

    if (options?.mcp && options.dataRepository) {
        const mcp = options.mcp
        const issueSchema = z
            .object({
                name: z.string().trim().min(1).max(100),
                scopes: z
                    .array(
                        z.enum([
                            'observations',
                            'meals',
                            'journal',
                            'preferences',
                            'observations:write',
                            'meals:write',
                            'checkins:write',
                        ]),
                    )
                    .min(1),
                dateFrom: z.string().datetime().optional(),
                dateTo: z.string().datetime().optional(),
                expiresAt: z.string().datetime().optional(),
            })
            .refine(
                input =>
                    !input.dateFrom ||
                    !input.dateTo ||
                    new Date(input.dateFrom) <= new Date(input.dateTo),
                { message: 'Invalid date grant' },
            )
            .refine(input => !input.expiresAt || new Date(input.expiresAt) > new Date(), {
                message: 'Expiry must be in the future',
            })
        app.get('/api/mcp/status', async () => ({
            enabled: await mcp.enabled(),
            clients: await mcp.list(),
        }))
        app.get('/api/mcp/access-log', async () => ({ data: await mcp.listAccessEvents() }))
        app.patch('/api/mcp/status', async (request, reply) => {
            const input = z.object({ enabled: z.boolean() }).safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            await mcp.setEnabled(input.data.enabled)
            return { enabled: input.data.enabled }
        })
        app.post('/api/mcp/clients', async (request, reply) => {
            const input = issueSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return reply.code(201).send(await mcp.issue(input.data))
        })
        app.delete<{ Params: { id: string } }>('/api/mcp/clients/:id', async (request, reply) => {
            await mcp.revoke(request.params.id)
            return reply.code(204).send()
        })
        app.delete<{ Params: { id: string } }>(
            '/api/mcp/clients/:id/permanent',
            async (request, reply) => {
                await mcp.delete(request.params.id)
                return reply.code(204).send()
            },
        )
        app.post('/mcp', async (request, reply) => {
            const authorization = request.headers.authorization
            const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined
            const client = await mcp.authenticate(token)
            if (!client) return reply.code(401).send({ error: 'invalid_mcp_credential' })

            const requestBody = request.body as {
                method?: string
                params?: { name?: string }
            }
            const tool = requestBody.params?.name ?? requestBody.method ?? 'unknown'
            const withinQuota = await mcp.withinQuota(client, tool)
            await mcp.auditRequest(client, tool)
            if (!withinQuota) {
                return reply.code(429).send({ error: 'mcp_tool_quota_exceeded' })
            }
            const mcpServer = createTrackItMcpServer(
                client,
                options.dataRepository!,
                repository,
                mcp,
            )
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
            await mcpServer.connect(transport)
            reply.hijack()
            await transport.handleRequest(request.raw, reply.raw, request.body)
            reply.raw.on('close', () => {
                void transport.close()
                void mcpServer.close()
            })
        })
        app.get('/mcp', async (_request, reply) =>
            reply.code(405).send({ error: 'streamable_http_post_required' }),
        )
    }

    if (options?.devices) {
        const devices = options.devices
        const deviceCredentials = (request: {
            headers: Record<string, string | string[] | undefined>
        }) => ({
            credential:
                typeof request.headers.authorization === 'string' &&
                request.headers.authorization.startsWith('Bearer ')
                    ? request.headers.authorization.slice(7)
                    : undefined,
            fingerprint:
                typeof request.headers['x-device-key-fingerprint'] === 'string'
                    ? request.headers['x-device-key-fingerprint']
                    : undefined,
            timestamp:
                typeof request.headers['x-device-timestamp'] === 'string'
                    ? request.headers['x-device-timestamp']
                    : undefined,
            deviceId:
                typeof request.headers['x-device-id'] === 'string'
                    ? request.headers['x-device-id']
                    : undefined,
            nonce:
                typeof request.headers['x-device-nonce'] === 'string'
                    ? request.headers['x-device-nonce']
                    : undefined,
            signature:
                typeof request.headers['x-device-signature'] === 'string'
                    ? request.headers['x-device-signature']
                    : undefined,
        })
        app.post('/api/devices/pair', async () => devices.createPairingCode())
        app.post('/api/devices/pair/request', async (request, reply) => {
            const input = z
                .object({
                    code: z.string().regex(/^\d{4}-\d{4}$/),
                    name: z.string().trim().min(1).max(100),
                    keyFingerprint: z.string().min(16).max(256),
                    publicKey: z.string().min(64).max(4000),
                    serverIdentity: z.string().min(1).max(500),
                })
                .safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            const paired = await devices.requestPairing(
                input.data.code,
                input.data.name,
                input.data.keyFingerprint,
                input.data.publicKey,
                input.data.serverIdentity,
            )
            const isErrorResponse = (
                r: typeof paired,
            ): r is {
                error: string
                error_details: { message: string; error: string }
                serverIdentity?: string | undefined
            } => 'error' in r && r.error !== undefined
            if (isErrorResponse(paired)) {
                return reply.code(401).send({
                    error: paired.error,
                    error_details: paired.error_details,
                })
            }
            return reply.code(202).send(paired)
        })
        app.post<{ Params: { id: string } }>('/api/devices/:id/confirm', async (request, reply) => {
            const device = await devices.confirm(request.params.id)
            return device ? { data: device } : reply.code(409).send({ error: 'not_pending' })
        })
        app.post<{ Params: { id: string } }>('/api/devices/:id/reject', async (request, reply) => {
            const device = await devices.reject(request.params.id)
            return device ? { data: device } : reply.code(409).send({ error: 'not_pending' })
        })
        app.delete<{ Params: { id: string } }>('/api/devices/:id', async (request, reply) => {
            await devices.revoke(request.params.id)
            return reply.code(204).send()
        })
        app.delete<{ Params: { id: string } }>(
            '/api/devices/:id/permanent',
            async (request, reply) => {
                await devices.delete(request.params.id)
                return reply.code(204).send()
            },
        )
        app.get('/api/devices', async () => ({ data: await devices.list() }))
        app.get('/api/device/status', async (request, reply) => {
            const credentials = deviceCredentials(request)
            const device = await devices.pairingStatus(
                credentials.credential,
                credentials.fingerprint,
            )
            return device ? { data: device } : reply.code(401).send({ error: 'unauthorized' })
        })
        const uploadRecordSchema = z.object({
            externalId: z.string().min(1).max(500),
            metric: z.string().min(1).max(100),
            value: z.number().finite(),
            unit: z.string().min(1).max(40),
            observedAt: z.string().datetime(),
            endedAt: z.string().datetime().optional(),
            version: z.number().int().nonnegative(),
            dataOrigin: z.string().min(1).max(300),
            deleted: z.boolean().optional(),
        })
        const healthRecordSchema = z.object({
            provider: z.string().min(1).max(100),
            recordType: z.string().min(1).max(150),
            externalId: z.string().min(1).max(500),
            externalVersion: z.number().int().nonnegative(),
            startTime: z.string().datetime(),
            endTime: z.string().datetime().optional(),
            dataOrigin: z.string().max(300).optional(),
            recordingMethod: z.string().max(100).optional(),
            device: z.record(z.string(), z.unknown()).optional(),
            payload: z.record(z.string(), z.unknown()),
            lastModifiedTime: z.string().datetime().optional(),
            deleted: z.boolean().optional(),
        })
        const authenticateDevice = async (request: FastifyRequest, bodyHash: string) => {
            const credentials = deviceCredentials(request)
            const path = request.url.split('?')[0]
            const result = await devices.authenticateDetailed({
                ...credentials,
                method: request.method,
                path,
                bodyHash,
            })
            if ('device' in result) return result.device

            request.log.warn(
                {
                    event: 'device.authentication.failed',
                    reason: result.error,
                    requestId: request.id,
                    method: request.method,
                    path,
                    deviceId: credentials.deviceId ?? null,
                    serverTime: result.serverTime,
                },
                'device authentication failed',
            )
            return null
        }
        app.post('/api/device/upload', async (request, reply) => {
            const device = await authenticateDevice(request, requestBodyHash(request))
            if (!device) return reply.code(401).send({ error: 'unauthorized' })
            const input = z
                .object({
                    idempotencyKey: z.string().uuid(),
                    records: z.array(uploadRecordSchema).max(1000),
                })
                .safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return devices.upload(
                device.id,
                input.data.idempotencyKey,
                input.data.records as DeviceUploadRecord[],
            )
        })
        app.post('/api/device/health-records', async (request, reply) => {
            const device = await authenticateDevice(request, requestBodyHash(request))
            if (!device) return reply.code(401).send({ error: 'unauthorized' })
            const input = z
                .object({
                    idempotencyKey: z.string().uuid(),
                    records: z.array(healthRecordSchema).max(1000),
                })
                .safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return devices.uploadHealthRecords(
                device.id,
                input.data.idempotencyKey,
                input.data.records as CanonicalHealthRecordInput[],
            )
        })
        app.post('/api/health-records/rebuild', async () => ({
            data: await devices.rebuildHealthRecordObservations(),
        }))
        app.put('/api/device/cursor', async (request, reply) => {
            const device = await authenticateDevice(request, requestBodyHash(request))
            if (!device) return reply.code(401).send({ error: 'unauthorized' })
            const input = z
                .object({
                    recordType: z.string().min(1).max(100),
                    cursor: z.string().max(4000).nullable(),
                    status: z.enum(['idle', 'syncing', 'complete', 'permission_revoked', 'error']),
                })
                .safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            await devices.updateCursor(
                device.id,
                input.data.recordType,
                input.data.cursor,
                input.data.status,
            )
            return reply.code(204).send()
        })
    }
    app.get('/api/ready', async (_request, reply) => {
        try {
            await repository.ready()
            return { status: 'ready' }
        } catch {
            return reply.code(503).send({ status: 'unavailable' })
        }
    })

    app.get<{ Querystring: Record<string, string | undefined> }>(
        '/api/journal',
        async (request, reply) => {
            const query = z
                .object({
                    from: z.string().datetime().optional(),
                    to: z.string().datetime().optional(),
                    before: z.string().datetime().optional(),
                    category: z
                        .enum(['Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins'])
                        .optional(),
                    source: z.string().max(120).optional(),
                    limit: z.coerce.number().int().min(1).max(100).default(100),
                })
                .refine(value => !value.from || !value.to || value.from <= value.to, {
                    message: 'from must be before to',
                    path: ['from'],
                })
                .safeParse(request.query)
            if (!query.success) return badRequest(request, reply, { validation: query.error })
            return { data: await repository.list(query.data) }
        },
    )
    if (options?.dataRepository) {
        const data = options.dataRepository
        const recordRangeSchema = z.object({
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
            definitionIds: z
                .string()
                .transform(value => value.split(',').filter(Boolean))
                .pipe(z.array(z.string().trim().min(1).max(100)).max(50))
                .optional(),
        })
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
                const dateRange = z
                    .object({
                        from: z.string().date().optional(),
                        to: z.string().date().optional(),
                    })
                    .safeParse(request.query)
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
        app.get<{ Querystring: { from?: string; to?: string } }>(
            '/api/meals',
            async (request, reply) => {
                const range = recordRangeSchema.safeParse(request.query)
                if (!range.success)
                    return badRequest(request, reply, {
                        error: 'invalid_range',
                        validation: range.error,
                    })
                return { data: await data.listMeals(range.data) }
            },
        )
        app.post('/api/meals', async (request, reply) => {
            const input = mealInputSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return reply.code(201).send({ data: await data.createMeal(input.data) })
        })
        app.patch<{ Params: { id: string } }>('/api/meals/:id', async (request, reply) => {
            const input = mealUpdateSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            const updated = await data.updateMeal(request.params.id, input.data)
            if (!updated) return reply.code(409).send({ error: 'version_conflict' })
            return { data: updated }
        })
        app.get('/api/preferences', async () => ({ data: await data.getPreferences() }))
        app.patch('/api/preferences', async (request, reply) => {
            const input = preferencesInputSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return { data: await data.updatePreferences(input.data) }
        })
        app.get<{ Querystring: { q?: string } }>('/api/foods', async request => ({
            data: await data.listFoods(request.query.q),
        }))
        app.post('/api/foods', async (request, reply) => {
            const input = foodInputSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return reply.code(201).send({ data: await data.createFood(input.data) })
        })
        app.post('/api/foods/import', async (request, reply) => {
            const input = foodImportSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return { data: await data.importFoods(input.data) }
        })
        app.get<{ Params: { barcode: string } }>(
            '/api/food-catalog/barcode/:barcode',
            async (request, reply) => {
                if (!options.foodCatalog)
                    return reply.code(503).send({ error: 'catalog_not_configured' })
                try {
                    const result = await options.foodCatalog.barcode(request.params.barcode)
                    return result ? { data: result } : reply.code(404).send({ error: 'not_found' })
                } catch {
                    return reply.code(502).send({ error: 'catalog_unavailable' })
                }
            },
        )
        app.get<{ Querystring: { q?: string } }>(
            '/api/food-catalog/search',
            async (request, reply) => {
                if (!options.foodCatalog)
                    return reply.code(503).send({ error: 'catalog_not_configured' })
                const query = request.query.q?.trim() ?? ''
                if (query.length < 2) return reply.code(400).send({ error: 'query_too_short' })
                try {
                    return { data: await options.foodCatalog.search(query) }
                } catch {
                    return reply.code(502).send({ error: 'catalog_unavailable' })
                }
            },
        )
        app.patch<{ Params: { id: string } }>('/api/foods/:id', async (request, reply) => {
            const input = foodUpdateSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            const updated = await data.updateFood(request.params.id, input.data)
            if (!updated) return reply.code(409).send({ error: 'version_conflict' })
            return { data: updated }
        })
        app.get('/api/recipes', async () => ({ data: await data.listRecipes() }))
        app.post('/api/recipes', async (request, reply) => {
            const input = recipeInputSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return reply.code(201).send({ data: await data.createRecipe(input.data) })
        })
        app.patch<{ Params: { id: string } }>('/api/recipes/:id', async (request, reply) => {
            const input = recipeUpdateSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            const updated = await data.updateRecipe(request.params.id, input.data)
            if (!updated) return reply.code(409).send({ error: 'version_conflict' })
            return { data: updated }
        })
        app.get('/api/goals', async () => ({ data: await data.listGoals() }))
        app.get<{ Querystring: { at?: string } }>(
            '/api/goals/evaluations',
            async (request, reply) => {
                const parsedAt = z.string().datetime().optional().safeParse(request.query.at)
                if (!parsedAt.success)
                    return badRequest(request, reply, { error: 'invalid_evaluation_time' })
                const now = parsedAt.data ? new Date(parsedAt.data) : new Date()
                const from = new Date(now)
                from.setUTCDate(from.getUTCDate() - 31)
                const [storedGoals, preference] = await Promise.all([
                    data.listGoals() as Promise<Goal[]>,
                    data.getPreferences() as Promise<{ timezone?: string }>,
                ])
                const metrics = [...new Set(storedGoals.map(goal => goal.metricId))]
                const records = metrics.length
                    ? ((await data.listObservations({
                          from: from.toISOString(),
                          to: now.toISOString(),
                          definitionIds: metrics,
                      })) as NumericObservation[])
                    : []
                return {
                    data: Object.fromEntries(
                        storedGoals.map(goal => [
                            goal.id,
                            evaluateGoal(goal, records, now, preference.timezone ?? 'UTC'),
                        ]),
                    ),
                }
            },
        )
        app.post('/api/goals', async (request, reply) => {
            const input = goalInputSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return reply.code(201).send({ data: await data.createGoal(input.data) })
        })
        app.patch<{ Params: { id: string } }>('/api/goals/:id', async (request, reply) => {
            const input = goalUpdateSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            const updated = await data.updateGoal(request.params.id, input.data)
            return updated ? { data: updated } : reply.code(404).send({ error: 'not_found' })
        })
        app.delete<{ Params: { id: string } }>('/api/goals/:id', async (request, reply) => {
            const removed = await data.removeGoal(request.params.id)
            return removed
                ? reply.code(204).send()
                : reply.code(409).send({ error: 'retire_before_delete' })
        })
        app.get('/api/trend-views', async () => ({ data: await data.listSavedTrendViews() }))
        app.post('/api/trend-views', async (request, reply) => {
            const input = savedTrendViewInputSchema.safeParse(request.body)
            if (!input.success) return badRequest(request, reply, { validation: input.error })
            return reply.code(201).send({ data: await data.createSavedTrendView(input.data) })
        })
    }

    app.setErrorHandler((error, request, reply) => {
        request.log.error(
            {
                err: error,
                requestId: request.id,
                method: request.method,
                url: request.url,
                body: request.body,
                validation:
                    typeof error === 'object' && error !== null && 'validation' in error
                        ? error.validation
                        : undefined,
                validationContext:
                    typeof error === 'object' && error !== null && 'validationContext' in error
                        ? error.validationContext
                        : undefined,
            },
            'request failed',
        )

        const statusCode =
            typeof error === 'object' &&
            error !== null &&
            'statusCode' in error &&
            typeof error.statusCode === 'number'
                ? error.statusCode
                : undefined

        if (statusCode && statusCode >= 400 && statusCode < 500) {
            return reply.code(statusCode).send({
                error: statusCode === 429 ? 'rate_limited' : 'request_rejected',
                requestId: request.id,
            })
        }

        return reply.code(500).send({ error: 'internal_error', requestId: request.id })
    })

    return app
}
