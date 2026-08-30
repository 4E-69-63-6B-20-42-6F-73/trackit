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
            post: { responses: { '201': { description: 'Created idempotently' } } },
        },
        '/api/journal/{id}': {
            patch: {
                responses: {
                    '200': { description: 'Updated' },
                    '409': { description: 'Conflict' },
                },
            },
            delete: { responses: { '204': { description: 'Deleted' } } },
        },
        '/api/observations': {
            get: {
                description:
                    'Bounded effective metric series after source resolution and derived metric calculation',
                responses: { '200': { description: 'Effective observations' } },
            },
            post: { responses: { '201': { description: 'Created' } } },
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
        '/api/preferences': {
            get: { responses: { '200': { description: 'Preferences' } } },
            patch: { responses: { '200': { description: 'Updated' } } },
        },
        '/api/metric-sources': {
            get: { responses: { '200': { description: 'Distinct metric source summaries' } } },
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
                    'Deletes a catalog food while preserving historical meal snapshots and refusing deletion while a recipe still references the food',
                responses: {
                    '204': { description: 'Deleted' },
                    '404': { description: 'Food not found' },
                    '409': { description: 'Version conflict or food is used by a recipe' },
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
