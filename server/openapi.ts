import { observationOpenApiPaths } from './contracts/observations.js'

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
        '/api/health': { get: { security: [], responses: { '200': { description: 'Healthy' } } } },
        '/api/ready': {
            get: {
                security: [],
                responses: {
                    '200': { description: 'Ready' },
                    '503': { description: 'Database unavailable' },
                },
            },
        },
        '/api/journal': {
            get: { responses: { '200': { description: 'Journal entries' } } },
        },
        ...observationOpenApiPaths,
        '/api/device/health-records': {
            post: {
                security: [],
                responses: {
                    '200': {
                        description: 'Canonical Health Connect records accepted idempotently',
                    },
                    '401': { description: 'Device authentication failed' },
                },
            },
        },
        '/api/health-records/rebuild': {
            post: {
                responses: {
                    '200': {
                        description:
                            'Rebuilt disposable observations and daily metrics from canonical records',
                    },
                },
            },
        },
        '/api/meals': {
            get: { responses: { '200': { description: 'Meals' } } },
            post: { responses: { '201': { description: 'Created' } } },
        },
        '/api/meals/{id}': {
            patch: {
                responses: {
                    '200': { description: 'Updated' },
                    '409': { description: 'Conflict' },
                },
            },
            delete: {
                description:
                    'Deletes a compound meal observation and all of its nutrient component observations',
                responses: {
                    '204': { description: 'Deleted' },
                    '404': { description: 'Meal not found' },
                },
            },
        },
        '/api/plan-items': {
            get: {
                description:
                    'Lists dated user intentions. Planned meals never contribute to health metrics until logged.',
                responses: { '200': { description: 'Plan items' } },
            },
            post: {
                description: 'Creates a planned meal referencing a saved food or recipe.',
                responses: {
                    '201': { description: 'Created' },
                    '404': { description: 'Food or recipe not found' },
                },
            },
        },
        '/api/plan-items/{id}': {
            patch: {
                responses: {
                    '200': { description: 'Updated' },
                    '404': { description: 'Plan item not found' },
                    '409': { description: 'Version conflict or fulfilled item' },
                },
            },
            delete: {
                responses: {
                    '204': { description: 'Removed from plan' },
                    '409': { description: 'Version conflict' },
                },
            },
        },
        '/api/plan-items/{id}/skip': {
            post: {
                description: 'Skips or restores a plan item without creating a health observation.',
                responses: {
                    '200': { description: 'Updated' },
                    '409': { description: 'Version conflict or fulfilled item' },
                },
            },
        },
        '/api/plan-items/{id}/log': {
            post: {
                description:
                    'Atomically creates the canonical compound meal observation and links it as the result of the plan item.',
                responses: {
                    '201': { description: 'Meal logged' },
                    '404': { description: 'Plan item or reference not found' },
                    '409': { description: 'Version conflict or already fulfilled' },
                },
            },
        },
        '/api/preferences': {
            get: { responses: { '200': { description: 'Preferences' } } },
            patch: { responses: { '200': { description: 'Updated' } } },
        },
        '/api/goals/evaluations': {
            get: {
                responses: {
                    '200': { description: 'Server-evaluated goals over effective observations' },
                },
            },
        },
        '/api/foods/{id}': {
            delete: {
                description:
                    'Deletes a catalog food while preserving historical meal snapshots and refusing deletion while a recipe or active meal plan still references the food',
                responses: {
                    '204': { description: 'Deleted' },
                    '404': { description: 'Food not found' },
                    '409': {
                        description: 'Version conflict or food is used by a recipe or meal plan',
                    },
                },
            },
        },
        '/api/foods/import': {
            post: { responses: { '200': { description: 'Per-row food import result' } } },
        },
        '/api/food-catalog/barcode/{barcode}': {
            get: { responses: { '200': { description: 'Normalized catalog food preview' } } },
        },
        '/api/food-catalog/search': {
            get: { responses: { '200': { description: 'Normalized catalog food previews' } } },
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
