export interface paths {
    '/api/observations': {
        get: {
            parameters: {
                query?: { definitionIds?: string; from?: string; to?: string }
                header?: never
                path?: never
                cookie?: never
            }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                canonicalUnit: string
                                canonicalValue: number
                                connector?: string | null
                                definitionId: string
                                endedAt?: string | null
                                excluded: boolean
                                externalId?: string | null
                                id: string
                                metadata?: { [key: string]: unknown }
                                observedAt: string
                                originalUnit: string
                                originalValue: number
                                provider?: string | null
                                sourceId?: string | null
                                version: number
                            }>
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        attributes?: { [key: string]: unknown }
                        booleanValue?: boolean
                        category?: 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'
                        categoryValue?: string
                        definitionId: string
                        detail?: string
                        id?: string
                        observedAt: string
                        source?: string
                        textValue?: string
                        title?: string
                        unit?: string
                        value?: number
                        valueType?: 'number' | 'text' | 'boolean' | 'category' | 'event'
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: { excluded: boolean; id: string; version: number }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
    '/api/observations/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                404: { headers: { [name: string]: unknown }; content?: never }
            }
        }
        patch: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        detail?: string
                        excluded?: boolean
                        observedAt?: string
                        textValue?: string
                        title?: string
                        version: number
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: { excluded: boolean; id: string; version: number }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
    '/api/daily-metrics': {
        get: {
            parameters: {
                query: { from: string; to: string }
                header?: never
                path?: never
                cookie?: never
            }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                date: string
                                definitionId: string
                                derivationVersion: number
                                unit: string
                                value: number
                            }>
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
    '/api/metric-sources': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                connector: string | null
                                definitionId: string
                                provider: string
                            }>
                        }
                    }
                }
            }
        }
    }
    '/api/preferences': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                displayName: string
                                experience: {
                                    dismissedWeeklyReflection?: string
                                    onboardingComplete?: boolean
                                    onboardingStep?: number
                                }
                                id: string
                                locale: string
                                mcpAllowedOrigins: Array<string>
                                mcpEnabled: boolean
                                metricPreferences: {
                                    [key: string]: {
                                        deduplication?: {
                                            disabledSources?: Array<string>
                                            policy: 'keep_all' | 'prefer_priority' | 'metric_merge'
                                            sourcePriority: Array<string>
                                        }
                                        displayUnit: string
                                        precision?: number
                                        showInJournal?: boolean
                                    }
                                }
                                metricResolutionVersion: number
                                timezone: string
                                updatedAt: string
                            }
                        }
                    }
                }
            }
        }
        patch: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        displayName?: string
                        experience?: {
                            dismissedWeeklyReflection?: string
                            onboardingComplete?: boolean
                            onboardingStep?: number
                        }
                        locale?: string
                        mcpEnabled?: boolean
                        metricPreferences?: {
                            [key: string]: {
                                deduplication?: {
                                    disabledSources?: Array<string>
                                    policy: 'keep_all' | 'prefer_priority' | 'metric_merge'
                                    sourcePriority: Array<string>
                                }
                                displayUnit: string
                                precision?: number
                                showInJournal?: boolean
                            }
                        }
                        timezone?: string
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                displayName: string
                                experience: {
                                    dismissedWeeklyReflection?: string
                                    onboardingComplete?: boolean
                                    onboardingStep?: number
                                }
                                id: string
                                locale: string
                                mcpAllowedOrigins: Array<string>
                                mcpEnabled: boolean
                                metricPreferences: {
                                    [key: string]: {
                                        deduplication?: {
                                            disabledSources?: Array<string>
                                            policy: 'keep_all' | 'prefer_priority' | 'metric_merge'
                                            sourcePriority: Array<string>
                                        }
                                        displayUnit: string
                                        precision?: number
                                        showInJournal?: boolean
                                    }
                                }
                                metricResolutionVersion: number
                                timezone: string
                                updatedAt: string
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
    '/api/goals': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                aggregation: 'latest' | 'average' | 'total'
                                canonicalUnit: string
                                comparator: 'gte' | 'lte' | 'between'
                                createdAt: string
                                definitionId: string
                                effectiveFrom: string
                                effectiveTo: string | null
                                id: string
                                period:
                                    | { type: 'day' }
                                    | { type: 'week' }
                                    | { days: 7 | 14 | 30; type: 'rolling' }
                                schedule: { weekdays?: Array<number> }
                                target: { value: number } | { max: number; min: number }
                                updatedAt: string
                            }>
                        }
                    }
                }
            }
        }
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        aggregation: 'latest' | 'average' | 'total'
                        canonicalUnit: string
                        comparator: 'gte' | 'lte' | 'between'
                        definitionId: string
                        effectiveFrom: string
                        effectiveTo?: string | null
                        period:
                            | { type: 'day' }
                            | { type: 'week' }
                            | { days: 7 | 14 | 30; type: 'rolling' }
                        schedule: { weekdays?: Array<number> }
                        target: { value: number } | { max: number; min: number }
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                aggregation: 'latest' | 'average' | 'total'
                                canonicalUnit: string
                                comparator: 'gte' | 'lte' | 'between'
                                createdAt: string
                                definitionId: string
                                effectiveFrom: string
                                effectiveTo: string | null
                                id: string
                                period:
                                    | { type: 'day' }
                                    | { type: 'week' }
                                    | { days: 7 | 14 | 30; type: 'rolling' }
                                schedule: { weekdays?: Array<number> }
                                target: { value: number } | { max: number; min: number }
                                updatedAt: string
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
    '/api/goals/evaluations': {
        get: {
            parameters: { query?: { at?: string }; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                [key: string]: {
                                    difference: number | null
                                    met: boolean | null
                                    observationCount: number
                                    periodEnd: string
                                    periodStart: string
                                    progress: number | null
                                    value: number | null
                                }
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
    '/api/goals/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
        patch: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: {
                content: {
                    'application/json':
                        | {
                              aggregation: 'latest' | 'average' | 'total'
                              canonicalUnit: string
                              comparator: 'gte' | 'lte' | 'between'
                              definitionId: string
                              effectiveFrom: string
                              effectiveTo?: string | null
                              period:
                                  | { type: 'day' }
                                  | { type: 'week' }
                                  | { days: 7 | 14 | 30; type: 'rolling' }
                              schedule: { weekdays?: Array<number> }
                              target: { value: number } | { max: number; min: number }
                          }
                        | { effectiveTo: string }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                aggregation: 'latest' | 'average' | 'total'
                                canonicalUnit: string
                                comparator: 'gte' | 'lte' | 'between'
                                createdAt: string
                                definitionId: string
                                effectiveFrom: string
                                effectiveTo: string | null
                                id: string
                                period:
                                    | { type: 'day' }
                                    | { type: 'week' }
                                    | { days: 7 | 14 | 30; type: 'rolling' }
                                schedule: { weekdays?: Array<number> }
                                target: { value: number } | { max: number; min: number }
                                updatedAt: string
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
    '/api/trend-views': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                comparisonDefinitionId: string | null
                                createdAt: string
                                definitionId: string
                                granularity: 'daily' | 'weekly'
                                id: string
                                name: string
                                rangeDays: number
                            }>
                        }
                    }
                }
            }
        }
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        comparisonDefinitionId?: string
                        definitionId: string
                        granularity: 'daily' | 'weekly'
                        name: string
                        rangeDays: number
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                comparisonDefinitionId: string | null
                                createdAt: string
                                definitionId: string
                                granularity: 'daily' | 'weekly'
                                id: string
                                name: string
                                rangeDays: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
            }
        }
    }
}
