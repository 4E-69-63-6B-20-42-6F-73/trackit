export interface paths {
    '/api/observations': {
        parameters: {
            query?: never
            header?: never
            path?: never
            cookie?: never
        }
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
                    headers: Record<string, unknown>
                    content: {
                        'application/json': {
                            data: components['schemas']['NumericObservation'][]
                        }
                    }
                }
                400: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': components['schemas']['ErrorResponse']
                    }
                }
            }
        }
        post: {
            parameters: {
                query?: never
                header?: never
                path?: never
                cookie?: never
            }
            requestBody: {
                content: {
                    'application/json': components['schemas']['CreateObservation']
                }
            }
            responses: {
                201: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': { data: unknown }
                    }
                }
                400: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': components['schemas']['ErrorResponse']
                    }
                }
            }
        }
    }
    '/api/observations/{id}': {
        parameters: {
            query?: never
            header?: never
            path?: never
            cookie?: never
        }
        patch: {
            parameters: {
                query?: never
                header?: never
                path: { id: string }
                cookie?: never
            }
            requestBody: {
                content: {
                    'application/json': components['schemas']['UpdateObservation']
                }
            }
            responses: {
                200: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': { data: unknown }
                    }
                }
                400: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': components['schemas']['ErrorResponse']
                    }
                }
                409: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': components['schemas']['ErrorResponse']
                    }
                }
            }
        }
        delete: {
            parameters: {
                query?: never
                header?: never
                path: { id: string }
                cookie?: never
            }
            requestBody?: never
            responses: {
                204: {
                    headers: Record<string, unknown>
                    content?: never
                }
                404: {
                    headers: Record<string, unknown>
                    content?: never
                }
            }
        }
    }
    '/api/metric-sources': {
        parameters: {
            query?: never
            header?: never
            path?: never
            cookie?: never
        }
        get: {
            parameters: {
                query?: never
                header?: never
                path?: never
                cookie?: never
            }
            requestBody?: never
            responses: {
                200: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': {
                            data: components['schemas']['MetricSourceSummary'][]
                        }
                    }
                }
            }
        }
    }
    '/api/daily-metrics': {
        parameters: {
            query?: never
            header?: never
            path?: never
            cookie?: never
        }
        get: {
            parameters: {
                query?: {
                    from?: string
                    to?: string
                }
                header?: never
                path?: never
                cookie?: never
            }
            requestBody?: never
            responses: {
                200: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': { data: unknown[] }
                    }
                }
                400: {
                    headers: Record<string, unknown>
                    content: {
                        'application/json': components['schemas']['ErrorResponse']
                    }
                }
            }
        }
    }
}

export interface components {
    schemas: {
        NumericObservation: {
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
        MetricSourceSummary: {
            definitionId: string
            provider: string
            connector: string | null
        }
        ErrorResponse: {
            error: string
        }
        CreateObservation: {
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
        UpdateObservation: {
            excluded?: boolean
            title?: string
            textValue?: string
            detail?: string
            observedAt?: string
            version: number
        }
    }
}
