export interface paths {
    '/api/observations': {
        get: {
            parameters: {
                query?: {
                    from?: string
                    to?: string
                    definitionIds?: string
                }
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
                            data: NumericObservation[]
                        }
                    }
                }
                400: ErrorResponse
            }
        }
        post: {
            parameters: EmptyParameters
            requestBody: {
                content: {
                    'application/json': ObservationInput
                }
            }
            responses: {
                201: ObservationMutationResponse
                400: ErrorResponse
            }
        }
    }
    '/api/observations/{id}': {
        delete: {
            parameters: PathIdParameters
            requestBody?: never
            responses: {
                204: EmptyResponse
                404: EmptyResponse
            }
        }
        patch: {
            parameters: PathIdParameters
            requestBody: {
                content: {
                    'application/json': ObservationUpdate
                }
            }
            responses: {
                200: ObservationMutationResponse
                400: ErrorResponse
                409: ErrorResponse
            }
        }
    }
    '/api/daily-metrics': {
        get: {
            parameters: {
                query: {
                    from: string
                    to: string
                }
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
                            data: DailyMetric[]
                        }
                    }
                }
                400: ErrorResponse
            }
        }
    }
    '/api/metric-sources': {
        get: {
            parameters: EmptyParameters
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: MetricSourceSummary[]
                        }
                    }
                }
            }
        }
    }
}

type EmptyParameters = {
    query?: never
    header?: never
    path?: never
    cookie?: never
}

type PathIdParameters = {
    query?: never
    header?: never
    path: { id: string }
    cookie?: never
}

type EmptyResponse = {
    headers: { [name: string]: unknown }
    content?: never
}

type ErrorResponse = {
    headers: { [name: string]: unknown }
    content: {
        'application/json': { error: string }
    }
}

type ObservationMutationResponse = {
    headers: { [name: string]: unknown }
    content: {
        'application/json': {
            data: ObservationMutationResult
        }
    }
}

type ObservationMutationResult = {
    id: string
    version: number
    excluded: boolean
}

type NumericObservation = {
    id: string
    definitionId: string
    canonicalValue: number
    canonicalUnit: string
    originalValue: number
    originalUnit: string
    observedAt: string
    endedAt?: string | null
    sourceId?: string | null
    externalId?: string | null
    provider?: string | null
    connector?: string | null
    metadata?: Record<string, unknown>
    excluded: boolean
    version: number
}

type ObservationInput = {
    id?: string
    definitionId: string
    valueType?: 'number' | 'text' | 'boolean' | 'category' | 'event'
    value?: number
    unit?: string
    textValue?: string
    detail?: string
    booleanValue?: boolean
    categoryValue?: string
    title?: string
    category?: 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'
    attributes?: Record<string, unknown>
    observedAt: string
    source?: string
}

type ObservationUpdate = {
    excluded?: boolean
    title?: string
    textValue?: string
    detail?: string
    observedAt?: string
    version: number
}

type DailyMetric = {
    date: string
    definitionId: string
    value: number
    unit: string
    derivationVersion: number
}

type MetricSourceSummary = {
    definitionId: string
    provider: string
    connector: string | null
}
