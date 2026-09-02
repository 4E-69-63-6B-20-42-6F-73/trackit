import { z } from 'zod'
import { appDataContractSchemas } from './contracts/app-data.js'
import { clientApiContractSchemas as client } from './contracts/client-api.js'
import { observationOpenApiPaths } from './contracts/observations.js'

const jsonContent = (schema: z.ZodType) => ({
    'application/json': { schema: z.toJSONSchema(schema) },
})
const requestBody = (schema: z.ZodType) => ({ required: true, content: jsonContent(schema) })
const jsonResponse = (description: string, schema: z.ZodType) => ({
    description,
    content: jsonContent(schema),
})
const errorResponse = (description: string) => jsonResponse(description, client.errorResponse)
const noContent = (description: string) => ({ description })
const pathParameter = (name: string, schema: Record<string, unknown> = { type: 'string' }) => ({
    name,
    in: 'path',
    required: true,
    schema,
})
const queryParameter = (
    name: string,
    schema: Record<string, unknown> = { type: 'string' },
    required = false,
) => ({ name, in: 'query', required, schema })
const headerParameter = (name: string, required = false) => ({
    name,
    in: 'header',
    required,
    schema: { type: 'string' },
})

const pathIdParameter = pathParameter('id')
const deviceAuthParameters = [
    headerParameter('Authorization'),
    headerParameter('x-device-key-fingerprint'),
    headerParameter('x-device-timestamp'),
    headerParameter('x-device-id'),
    headerParameter('x-device-nonce'),
    headerParameter('x-device-signature'),
] as const

export const openApiContract = {
    openapi: '3.1.0',
    info: {
        title: 'TrackIt API',
        version: '0.1.0',
        description: 'Private API for a single-owner self-hosted TrackIt installation.',
    },
    servers: [{ url: '/' }],
    security: [{ cookieSession: [] }],
    paths: {
        '/api/health': {
            get: {
                security: [],
                responses: { '200': jsonResponse('Healthy', z.object({ status: z.literal('ok') })) },
            },
        },
        '/api/ready': {
            get: {
                security: [],
                responses: {
                    '200': jsonResponse('Ready', z.object({ status: z.literal('ready') })),
                    '503': jsonResponse(
                        'Database unavailable',
                        z.object({ status: z.literal('unavailable') }),
                    ),
                },
            },
        },
        '/api/openapi.json': {
            get: {
                security: [],
                responses: {
                    '200': jsonResponse('OpenAPI document', z.record(z.string(), z.unknown())),
                },
            },
        },
        '/api/auth/status': {
            get: {
                security: [],
                responses: { '200': jsonResponse('Authentication status', client.authStatus) },
            },
        },
        '/api/auth/setup': {
            post: {
                security: [],
                parameters: [headerParameter('x-trackit-bootstrap-secret', true)],
                requestBody: requestBody(client.passwordInput),
                responses: {
                    '201': jsonResponse('Owner account created', client.setupResponse),
                    '400': errorResponse('Invalid password'),
                    '403': errorResponse('Invalid bootstrap secret'),
                    '409': errorResponse('Owner already configured'),
                    '503': errorResponse('Bootstrap secret not configured'),
                },
            },
        },
        '/api/auth/login': {
            post: {
                security: [],
                requestBody: requestBody(client.passwordInput),
                responses: {
                    '200': jsonResponse('Authenticated', client.okStatus),
                    '400': errorResponse('Invalid request'),
                    '401': errorResponse('Invalid credentials'),
                    '429': errorResponse('Rate limited'),
                },
            },
        },
        '/api/auth/recover': {
            post: {
                security: [],
                requestBody: requestBody(client.recoveryInput),
                responses: {
                    '200': jsonResponse('Recovered session', client.okStatus),
                    '400': errorResponse('Invalid recovery request'),
                    '401': errorResponse('Invalid recovery code'),
                    '429': errorResponse('Rate limited'),
                },
            },
        },
        '/api/auth/passkey/register/options': {
            post: {
                responses: {
                    '200': jsonResponse('Passkey registration options', client.passkeyOptions),
                },
            },
        },
        '/api/auth/passkey/register/verify': {
            post: {
                requestBody: requestBody(client.passkeyVerify),
                responses: {
                    '200': jsonResponse('Passkey registered', client.passkeyVerified),
                    '400': errorResponse('Passkey verification failed'),
                },
            },
        },
        '/api/auth/passkey/authenticate/options': {
            post: {
                security: [],
                responses: {
                    '200': jsonResponse('Passkey authentication options', client.passkeyOptions),
                },
            },
        },
        '/api/auth/passkey/authenticate/verify': {
            post: {
                security: [],
                requestBody: requestBody(client.passkeyVerify),
                responses: {
                    '200': jsonResponse('Authenticated', client.okStatus),
                    '400': errorResponse('Invalid passkey response'),
                    '401': errorResponse('Passkey verification failed'),
                },
            },
        },
        '/api/auth/logout': {
            post: { responses: { '204': noContent('Signed out') } },
        },
        '/api/auth/logout-all': {
            post: { responses: { '204': noContent('All sessions revoked') } },
        },
        '/api/auth/sessions': {
            get: { responses: { '200': jsonResponse('Active sessions', client.sessionsResponse) } },
        },
        '/api/auth/sessions/{id}': {
            parameters: [pathIdParameter],
            delete: { responses: { '204': noContent('Session revoked') } },
        },
        '/api/auth/audit': {
            get: { responses: { '200': jsonResponse('Audit events', client.auditResponse) } },
        },
        '/api/export': {
            get: {
                parameters: [
                    queryParameter('format', { type: 'string', enum: ['json', 'csv'], default: 'json' }),
                ],
                responses: {
                    '200': {
                        description: 'Portable export',
                        content: {
                            'application/json': {
                                schema: z.toJSONSchema(z.record(z.string(), z.unknown())),
                            },
                            'text/csv': { schema: { type: 'string' } },
                        },
                    },
                },
            },
        },
        '/api/data-summary': {
            get: {
                parameters: [
                    queryParameter(
                        'category',
                        { type: 'string', enum: ['observations', 'meals', 'checkins'] },
                        true,
                    ),
                ],
                responses: {
                    '200': jsonResponse(
                        'Data category summary',
                        z.object({ data: z.unknown() }),
                    ),
                    '400': errorResponse('Invalid category'),
                },
            },
        },
        '/api/data/{category}': {
            parameters: [
                pathParameter('category', {
                    type: 'string',
                    enum: ['observations', 'meals', 'checkins'],
                }),
            ],
            delete: {
                responses: {
                    '204': noContent('Category data deleted'),
                    '400': errorResponse('Invalid category'),
                },
            },
        },
        '/api/data/delete-owner': {
            post: {
                requestBody: requestBody(client.ownerDeleteInput),
                responses: {
                    '204': noContent('All owner data deleted'),
                    '400': errorResponse('Confirmation required'),
                },
            },
        },
        '/api/data/rebuild-projections': {
            post: {
                requestBody: requestBody(client.maintenanceDateRange),
                responses: {
                    '200': jsonResponse('Projection rebuild queued', client.projectionRebuildResponse),
                    '400': errorResponse('Invalid range'),
                },
            },
        },
        '/api/data/rederive-observations': {
            post: {
                requestBody: requestBody(client.providerRecordMaintenance),
                responses: {
                    '200': jsonResponse('Provider records rederived', client.providerRederiveResponse),
                    '400': errorResponse('Invalid range'),
                },
            },
        },
        '/api/mcp/status': {
            get: { responses: { '200': jsonResponse('MCP status', client.mcpStatus) } },
            patch: {
                requestBody: requestBody(client.mcpEnabledInput),
                responses: {
                    '200': jsonResponse('MCP setting updated', client.mcpEnabledResponse),
                    '400': errorResponse('Invalid MCP setting'),
                },
            },
        },
        '/api/mcp/access-log': {
            get: {
                responses: { '200': jsonResponse('MCP access events', client.mcpAccessLogResponse) },
            },
        },
        '/api/mcp/browser-origins': {
            put: {
                requestBody: requestBody(client.mcpOriginsInput),
                responses: {
                    '200': jsonResponse('Browser origins updated', client.mcpOriginsResponse),
                    '400': errorResponse('Invalid browser origins'),
                },
            },
        },
        '/api/mcp/clients': {
            post: {
                requestBody: requestBody(client.mcpIssueInput),
                responses: {
                    '201': jsonResponse('MCP credential issued', client.mcpIssueResult),
                    '400': errorResponse('Invalid MCP credential request'),
                },
            },
        },
        '/api/mcp/clients/{id}': {
            parameters: [pathIdParameter],
            delete: { responses: { '204': noContent('MCP credential revoked') } },
        },
        '/api/mcp/clients/{id}/permanent': {
            parameters: [pathIdParameter],
            delete: { responses: { '204': noContent('MCP credential deleted') } },
        },
        '/mcp': {
            get: { responses: { '405': errorResponse('Streamable HTTP requires POST') } },
            options: {
                responses: {
                    '204': noContent('CORS preflight accepted'),
                    '403': errorResponse('Origin not allowed'),
                },
            },
            post: {
                security: [],
                requestBody: requestBody(z.unknown()),
                responses: {
                    '200': jsonResponse('MCP Streamable HTTP response', z.unknown()),
                    '401': errorResponse('Invalid MCP credential'),
                    '429': errorResponse('MCP tool quota exceeded'),
                },
            },
        },
        '/api/devices/pair': {
            post: { responses: { '200': jsonResponse('Pairing code created', client.pairingCode) } },
        },
        '/api/devices/pair/request': {
            post: {
                security: [],
                requestBody: requestBody(client.pairingRequest),
                responses: {
                    '202': jsonResponse('Pairing requested', client.pairingResponse),
                    '400': errorResponse('Invalid pairing request'),
                    '401': errorResponse('Pairing rejected'),
                },
            },
        },
        '/api/devices': {
            get: { responses: { '200': jsonResponse('Devices', client.devicesResponse) } },
        },
        '/api/devices/{id}/confirm': {
            parameters: [pathIdParameter],
            post: {
                responses: {
                    '200': jsonResponse('Device confirmed', z.object({ data: z.unknown() })),
                    '409': errorResponse('Device is not pending'),
                },
            },
        },
        '/api/devices/{id}/reject': {
            parameters: [pathIdParameter],
            post: {
                responses: {
                    '200': jsonResponse('Device rejected', z.object({ data: z.unknown() })),
                    '409': errorResponse('Device is not pending'),
                },
            },
        },
        '/api/devices/{id}': {
            parameters: [pathIdParameter],
            delete: { responses: { '204': noContent('Device revoked') } },
        },
        '/api/devices/{id}/permanent': {
            parameters: [pathIdParameter],
            delete: { responses: { '204': noContent('Device deleted') } },
        },
        '/api/device/status': {
            get: {
                security: [],
                parameters: deviceAuthParameters,
                responses: {
                    '200': jsonResponse('Device pairing status', client.deviceStatusResponse),
                    '401': errorResponse('Device authentication failed'),
                },
            },
        },
        '/api/device/health-records': {
            post: {
                security: [],
                parameters: deviceAuthParameters,
                requestBody: requestBody(client.healthRecordBatch),
                responses: {
                    '200': jsonResponse(
                        'Canonical Health Connect records accepted idempotently',
                        client.healthRecordUploadResult,
                    ),
                    '400': errorResponse('Invalid health record batch'),
                    '401': errorResponse('Device authentication failed'),
                },
            },
        },
        '/api/device/health-records/reconcile': {
            post: {
                security: [],
                parameters: deviceAuthParameters,
                requestBody: requestBody(client.healthRecordReconcile),
                responses: {
                    '200': jsonResponse('Health records reconciled', client.healthRecordReconcileResult),
                    '400': errorResponse('Invalid reconciliation request'),
                    '401': errorResponse('Device authentication failed'),
                },
            },
        },
        '/api/device/cursor': {
            put: {
                security: [],
                parameters: deviceAuthParameters,
                requestBody: requestBody(client.cursorUpdate),
                responses: {
                    '204': noContent('Sync cursor updated'),
                    '400': errorResponse('Invalid cursor update'),
                    '401': errorResponse('Device authentication failed'),
                },
            },
        },
        '/api/health-records/rebuild': {
            post: {
                responses: {
                    '200': jsonResponse(
                        'Rebuilt disposable observations from canonical health records',
                        z.object({ data: z.object({ records: z.number().int() }) }),
                    ),
                },
            },
        },
        '/api/journal': {
            get: {
                parameters: [
                    queryParameter('from', { type: 'string', format: 'date-time' }),
                    queryParameter('to', { type: 'string', format: 'date-time' }),
                    queryParameter('before', { type: 'string', format: 'date-time' }),
                    queryParameter('category', {
                        type: 'string',
                        enum: ['Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins'],
                    }),
                    queryParameter('source'),
                    queryParameter('limit', { type: 'integer', minimum: 1, maximum: 100 }),
                ],
                responses: {
                    '200': jsonResponse('Journal entries', client.journalResponse),
                    '400': errorResponse('Invalid journal query'),
                },
            },
        },
        '/api/journal/{id}': {
            parameters: [pathIdParameter],
            get: {
                responses: {
                    '200': jsonResponse('Journal entry', client.journalEntryResponse),
                    '400': errorResponse('Invalid journal entry id'),
                    '404': errorResponse('Journal entry not found'),
                },
            },
        },
        ...observationOpenApiPaths,
        '/api/meals': {
            get: {
                parameters: [
                    queryParameter('from', { type: 'string', format: 'date-time' }),
                    queryParameter('to', { type: 'string', format: 'date-time' }),
                ],
                responses: {
                    '200': jsonResponse('Meals', client.mealsResponse),
                    '400': errorResponse('Invalid range'),
                },
            },
            post: {
                requestBody: requestBody(client.mealInput),
                responses: {
                    '201': jsonResponse('Meal created', client.mealResponse),
                    '400': errorResponse('Invalid meal'),
                },
            },
        },
        '/api/meals/{id}': {
            parameters: [pathIdParameter],
            patch: {
                requestBody: requestBody(client.mealUpdate),
                responses: {
                    '200': jsonResponse('Meal updated', client.mealResponse),
                    '400': errorResponse('Invalid meal update'),
                    '409': errorResponse('Version conflict'),
                },
            },
            delete: {
                description:
                    'Deletes a compound meal observation and all of its nutrient component observations',
                responses: {
                    '204': noContent('Deleted'),
                    '404': errorResponse('Meal not found'),
                },
            },
        },
        '/api/preferences': {
            get: {
                responses: {
                    '200': jsonResponse('Preferences', appDataContractSchemas.preferencesResponse),
                },
            },
            patch: {
                requestBody: requestBody(appDataContractSchemas.preferencesInput),
                responses: {
                    '200': jsonResponse('Updated', appDataContractSchemas.preferencesResponse),
                    '400': jsonResponse('Invalid preferences', appDataContractSchemas.errorResponse),
                },
            },
        },
        '/api/foods': {
            get: {
                parameters: [queryParameter('q')],
                responses: { '200': jsonResponse('Foods', client.foodsResponse) },
            },
            post: {
                requestBody: requestBody(client.foodInput),
                responses: {
                    '201': jsonResponse('Food created', client.foodResponse),
                    '400': errorResponse('Invalid food'),
                },
            },
        },
        '/api/foods/{id}': {
            parameters: [pathIdParameter],
            patch: {
                requestBody: requestBody(client.foodUpdate),
                responses: {
                    '200': jsonResponse('Food updated', client.foodResponse),
                    '400': errorResponse('Invalid food update'),
                    '409': errorResponse('Version conflict'),
                },
            },
            delete: {
                description:
                    'Deletes a catalog food while preserving historical meal snapshots and refusing deletion while a recipe or active meal plan still references the food',
                requestBody: requestBody(client.foodDeleteInput),
                responses: {
                    '204': noContent('Deleted'),
                    '400': errorResponse('Invalid food delete'),
                    '404': errorResponse('Food not found'),
                    '409': jsonResponse('Version conflict or food is in use', client.foodDeleteConflict),
                },
            },
        },
        '/api/foods/import': {
            post: {
                requestBody: requestBody(client.foodImportInput),
                responses: {
                    '200': jsonResponse('Per-row food import result', client.foodImportResponse),
                    '400': errorResponse('Invalid food import'),
                },
            },
        },
        '/api/food-catalog/barcode/{barcode}': {
            parameters: [pathParameter('barcode')],
            get: {
                responses: {
                    '200': jsonResponse('Normalized catalog food preview', client.catalogFoodResponse),
                    '404': errorResponse('Food not found'),
                    '502': errorResponse('Catalog unavailable'),
                    '503': errorResponse('Catalog not configured'),
                },
            },
        },
        '/api/food-catalog/search': {
            get: {
                parameters: [queryParameter('q', { type: 'string', minLength: 2 }, true)],
                responses: {
                    '200': jsonResponse('Normalized catalog food previews', client.catalogFoodsResponse),
                    '400': errorResponse('Query too short'),
                    '502': errorResponse('Catalog unavailable'),
                    '503': errorResponse('Catalog not configured'),
                },
            },
        },
        '/api/food-categories': {
            get: {
                responses: { '200': jsonResponse('Food categories', client.foodCategoriesResponse) },
            },
        },
        '/api/foods/{id}/categories': {
            parameters: [pathIdParameter],
            put: {
                requestBody: requestBody(client.foodCategoryMembershipInput),
                responses: {
                    '200': jsonResponse('Food categories updated', client.foodCategoryMembershipResponse),
                    '400': errorResponse('Invalid food categories'),
                    '404': errorResponse('Food not found'),
                },
            },
        },
        '/api/recipes': {
            get: { responses: { '200': jsonResponse('Recipes', client.recipesResponse) } },
            post: {
                requestBody: requestBody(client.recipeInput),
                responses: {
                    '201': jsonResponse('Recipe created', client.createdRecipeResponse),
                    '400': errorResponse('Invalid recipe'),
                },
            },
        },
        '/api/recipes/{id}': {
            parameters: [pathIdParameter],
            patch: {
                requestBody: requestBody(client.recipeUpdate),
                responses: {
                    '200': jsonResponse('Recipe updated', client.recipeUpdateResponse),
                    '400': errorResponse('Invalid recipe update'),
                    '409': errorResponse('Version conflict'),
                },
            },
        },
        '/api/recipes/{id}/favorite': {
            parameters: [pathIdParameter],
            patch: {
                requestBody: requestBody(client.recipeFavoriteInput),
                responses: {
                    '200': jsonResponse('Recipe favorite updated', client.recipeFavoriteResponse),
                    '400': errorResponse('Invalid favorite update'),
                    '404': errorResponse('Recipe not found'),
                    '409': errorResponse('Version conflict'),
                },
            },
        },
        '/api/goals': {
            get: {
                responses: { '200': jsonResponse('Goals', appDataContractSchemas.goalsResponse) },
            },
            post: {
                requestBody: requestBody(appDataContractSchemas.goalInput),
                responses: {
                    '201': jsonResponse('Created goal', appDataContractSchemas.goalResponse),
                    '400': jsonResponse('Invalid goal', appDataContractSchemas.errorResponse),
                },
            },
        },
        '/api/goals/evaluations': {
            get: {
                parameters: [queryParameter('at', { type: 'string', format: 'date-time' })],
                responses: {
                    '200': jsonResponse(
                        'Server-evaluated goals over effective observations',
                        appDataContractSchemas.goalEvaluationsResponse,
                    ),
                    '400': jsonResponse(
                        'Invalid evaluation instant',
                        appDataContractSchemas.errorResponse,
                    ),
                },
            },
        },
        '/api/goals/{id}': {
            parameters: [pathIdParameter],
            patch: {
                requestBody: requestBody(appDataContractSchemas.goalUpdate),
                responses: {
                    '200': jsonResponse('Updated goal', appDataContractSchemas.goalResponse),
                    '400': jsonResponse('Invalid goal', appDataContractSchemas.errorResponse),
                    '404': jsonResponse('Goal not found', appDataContractSchemas.errorResponse),
                },
            },
            delete: {
                responses: {
                    '204': noContent('Deleted retired goal'),
                    '409': jsonResponse(
                        'Only retired goals can be deleted',
                        appDataContractSchemas.errorResponse,
                    ),
                },
            },
        },
        '/api/trend-views': {
            get: {
                responses: {
                    '200': jsonResponse('Saved trend views', appDataContractSchemas.savedTrendViewsResponse),
                },
            },
            post: {
                requestBody: requestBody(appDataContractSchemas.savedTrendViewInput),
                responses: {
                    '201': jsonResponse('Saved trend view', appDataContractSchemas.savedTrendViewResponse),
                    '400': jsonResponse('Invalid trend view', appDataContractSchemas.errorResponse),
                },
            },
        },
        '/api/plan-items': {
            get: {
                description:
                    'Lists dated user intentions. Planned meals never contribute to health metrics until logged.',
                parameters: [
                    queryParameter('from', { type: 'string', format: 'date' }),
                    queryParameter('to', { type: 'string', format: 'date' }),
                ],
                responses: {
                    '200': jsonResponse('Plan items', client.planItemsResponse),
                    '400': errorResponse('Invalid range'),
                },
            },
            post: {
                description: 'Creates a planned meal referencing a saved food, recipe, or food group.',
                requestBody: requestBody(client.planItemInput),
                responses: {
                    '201': jsonResponse('Plan item created', client.planItemResponse),
                    '400': errorResponse('Invalid plan item'),
                    '404': errorResponse('Reference not found'),
                },
            },
        },
        '/api/plan-items/{id}': {
            parameters: [pathIdParameter],
            patch: {
                requestBody: requestBody(client.planItemUpdate),
                responses: {
                    '200': jsonResponse('Plan item updated', client.planItemResponse),
                    '400': errorResponse('Invalid plan item'),
                    '404': errorResponse('Plan item or reference not found'),
                    '409': errorResponse('Version conflict or fulfilled item'),
                },
            },
            delete: {
                requestBody: requestBody(client.planDeleteInput),
                responses: {
                    '204': noContent('Removed from plan'),
                    '400': errorResponse('Invalid plan item'),
                    '404': errorResponse('Plan item not found'),
                    '409': errorResponse('Version conflict'),
                },
            },
        },
        '/api/plan-items/{id}/skip': {
            parameters: [pathIdParameter],
            post: {
                description: 'Skips or restores a plan item without creating a health observation.',
                requestBody: requestBody(client.planSkipInput),
                responses: {
                    '200': jsonResponse('Plan item updated', client.planItemResponse),
                    '400': errorResponse('Invalid plan item'),
                    '409': errorResponse('Version conflict or fulfilled item'),
                },
            },
        },
        '/api/plan-items/{id}/log': {
            parameters: [pathIdParameter],
            post: {
                description:
                    'Atomically creates the canonical compound meal observation and links it as the result of the plan item.',
                requestBody: requestBody(client.planLogInput),
                responses: {
                    '201': jsonResponse('Meal logged', client.planLogResponse),
                    '400': errorResponse('Invalid log request'),
                    '404': errorResponse('Plan item or reference not found'),
                    '409': errorResponse('Version conflict or already fulfilled'),
                },
            },
        },
        '/api/plan-schedules': {
            get: {
                responses: { '200': jsonResponse('Recurring meal schedules', client.planSchedulesResponse) },
            },
            post: {
                requestBody: requestBody(client.planScheduleInput),
                responses: {
                    '201': jsonResponse('Recurring meal schedule created', client.planScheduleResponse),
                    '400': errorResponse('Invalid recurring meal schedule'),
                    '404': errorResponse('Reference not found'),
                },
            },
        },
        '/api/plan-schedules/{id}': {
            parameters: [pathIdParameter],
            delete: {
                requestBody: requestBody(client.planScheduleStop),
                responses: {
                    '204': noContent('Recurring meal schedule stopped'),
                    '400': errorResponse('Invalid recurring meal schedule'),
                    '409': errorResponse('Version conflict'),
                },
            },
        },
    },
    components: {
        securitySchemes: {
            cookieSession: { type: 'apiKey', in: 'cookie', name: 'trackit_session' },
        },
    },
} as const

const generatedObservationMethods = {
    '/api/observations': ['get', 'post'],
    '/api/observations/{id}': ['patch'],
    '/api/daily-metrics': ['get'],
    '/api/metric-sources': ['get'],
} as const

export function mergeGeneratedObservationPaths(generated: {
    paths?: Record<string, Record<string, unknown>>
}) {
    const paths = openApiContract.paths as Record<string, Record<string, unknown>>
    for (const [path, methods] of Object.entries(generatedObservationMethods)) {
        const source = generated.paths?.[path]
        if (!source) continue
        const target = (paths[path] ??= {})
        for (const method of methods) {
            const operation = source[method]
            if (operation) target[method] = operation
        }
    }
}
