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
            get: { responses: { '200': { description: 'Observations' } } },
            post: { responses: { '201': { description: 'Created' } } },
        },
        '/api/daily-metrics': {
            get: {
                responses: {
                    '200': { description: 'Query-optimized UTC daily metric aggregates' },
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
