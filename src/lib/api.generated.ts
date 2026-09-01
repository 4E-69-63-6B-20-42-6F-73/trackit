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
                '200': {
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
                '400': {
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
                '201': {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: { excluded: boolean; id: string; version: number }
                        }
                    }
                }
                '400': {
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
                '204': { headers: { [name: string]: unknown }; content?: never }
                '404': { headers: { [name: string]: unknown }; content?: never }
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
                '200': {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: { excluded: boolean; id: string; version: number }
                        }
                    }
                }
                '400': {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string } }
                }
                '409': {
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
                '200': {
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
                '400': {
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
                '200': {
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
}
