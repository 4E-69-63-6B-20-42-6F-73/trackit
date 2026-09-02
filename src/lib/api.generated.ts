export interface paths {
    '/api/auth/audit': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                action: string
                                actor: string
                                createdAt: string
                                id: string
                                targetId: string | null
                                targetType: string | null
                            }>
                        }
                    }
                }
            }
        }
    }
    '/api/auth/login': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: { content: { 'application/json': { password: string } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { status: 'ok' } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                429: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/auth/logout': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: { 204: { headers: { [name: string]: unknown }; content?: never } }
        }
    }
    '/api/auth/logout-all': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: { 204: { headers: { [name: string]: unknown }; content?: never } }
        }
    }
    '/api/auth/passkey/authenticate/options': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { attemptId: string; options: unknown } }
                }
            }
        }
    }
    '/api/auth/passkey/authenticate/verify': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: { 'application/json': { attemptId: string; response: unknown } }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { status: 'ok' } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/auth/passkey/register/options': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { attemptId: string; options: unknown } }
                }
            }
        }
    }
    '/api/auth/passkey/register/verify': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: { 'application/json': { attemptId: string; response: unknown } }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { verified: true } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/auth/recover': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: { content: { 'application/json': { code: string } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { status: 'ok' } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                429: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/auth/sessions': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                createdAt: string
                                current: boolean
                                expiresAt: string
                                id: string
                                ipAddress: string | null
                                userAgent: string | null
                            }>
                        }
                    }
                }
            }
        }
    }
    '/api/auth/sessions/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: { 204: { headers: { [name: string]: unknown }; content?: never } }
        }
    }
    '/api/auth/setup': {
        post: {
            parameters: {
                query?: never
                header: { 'x-trackit-bootstrap-secret': string }
                path?: never
                cookie?: never
            }
            requestBody: { content: { 'application/json': { password: string } } }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { recoveryCodes: Array<string> } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                403: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                503: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/auth/status': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { authenticated: boolean; configured: boolean } }
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
    '/api/data-summary': {
        get: {
            parameters: {
                query: { category: 'observations' | 'meals' | 'checkins' }
                header?: never
                path?: never
                cookie?: never
            }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { data: unknown } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/data/{category}': {
        delete: {
            parameters: {
                query?: never
                header?: never
                path: { category: 'observations' | 'meals' | 'checkins' }
                cookie?: never
            }
            requestBody?: never
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/data/delete-owner': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: { 'application/json': { confirmation: 'DELETE ALL TRACKIT DATA' } }
            }
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/data/rebuild-projections': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': { lastDays: number } | { from?: string; to?: string }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { data: { queuedDates: number } } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/data/rederive-observations': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json':
                        | { lastDays: number; recordTypes?: Array<string> }
                        | { from?: string; recordTypes?: Array<string>; to?: string }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                canonicalObservations: number
                                queuedProjectionDates: number
                                sourceRecords: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/device/cursor': {
        put: {
            parameters: {
                query?: never
                header?: {
                    Authorization?: string
                    'x-device-id'?: string
                    'x-device-key-fingerprint'?: string
                    'x-device-nonce'?: string
                    'x-device-signature'?: string
                    'x-device-timestamp'?: string
                }
                path?: never
                cookie?: never
            }
            requestBody: {
                content: {
                    'application/json': {
                        cursor: string | null
                        recordType: string
                        status: 'idle' | 'syncing' | 'complete' | 'permission_revoked' | 'error'
                    }
                }
            }
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/device/health-records': {
        post: {
            parameters: {
                query?: never
                header?: {
                    Authorization?: string
                    'x-device-id'?: string
                    'x-device-key-fingerprint'?: string
                    'x-device-nonce'?: string
                    'x-device-signature'?: string
                    'x-device-timestamp'?: string
                }
                path?: never
                cookie?: never
            }
            requestBody: {
                content: {
                    'application/json': {
                        idempotencyKey: string
                        records: Array<{
                            dataOrigin?: string
                            deleted?: boolean
                            device?: { [key: string]: unknown }
                            endTime?: string
                            externalId: string
                            externalVersion: number
                            lastModifiedTime?: string
                            payload: { [key: string]: unknown }
                            provider: string
                            recordingMethod?: string
                            recordType: string
                            startTime: string
                        }>
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { accepted: number; duplicate: boolean } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/device/health-records/reconcile': {
        post: {
            parameters: {
                query?: never
                header?: {
                    Authorization?: string
                    'x-device-id'?: string
                    'x-device-key-fingerprint'?: string
                    'x-device-nonce'?: string
                    'x-device-signature'?: string
                    'x-device-timestamp'?: string
                }
                path?: never
                cookie?: never
            }
            requestBody: {
                content: {
                    'application/json': {
                        presentExternalIds: Array<string>
                        recordType: string
                        since: string
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            missing?: number
                            removed?: number
                            [key: string]: unknown
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/device/status': {
        get: {
            parameters: {
                query?: never
                header?: {
                    Authorization?: string
                    'x-device-id'?: string
                    'x-device-key-fingerprint'?: string
                    'x-device-nonce'?: string
                    'x-device-signature'?: string
                    'x-device-timestamp'?: string
                }
                path?: never
                cookie?: never
            }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: { id: string; revokedAt: string | null; status: string }
                        }
                    }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/devices': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                configuredAt: string | null
                                confirmedAt: string | null
                                createdAt: string
                                id: string
                                keyFingerprint: string
                                lastSeenAt: string | null
                                name: string
                                revokedAt: string | null
                                status: string
                                sync: Array<{
                                    diagnostic: string | null
                                    lastSyncedAt: string | null
                                    recordType: string
                                    status: string
                                }>
                            }>
                        }
                    }
                }
            }
        }
    }
    '/api/devices/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: { 204: { headers: { [name: string]: unknown }; content?: never } }
        }
    }
    '/api/devices/{id}/confirm': {
        post: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { data: unknown } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/devices/{id}/permanent': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: { 204: { headers: { [name: string]: unknown }; content?: never } }
        }
    }
    '/api/devices/{id}/reject': {
        post: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { data: unknown } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/devices/pair': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            code: string
                            expiresAt: string
                            serverIdentity: string
                        }
                    }
                }
            }
        }
    }
    '/api/devices/pair/request': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        code: string
                        keyFingerprint: string
                        name: string
                        publicKey: string
                        serverIdentity: string
                    }
                }
            }
            responses: {
                202: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            credential: string
                            deviceId: string
                            serverIdentity: string
                            status: string
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/export': {
        get: {
            parameters: {
                query?: { format?: 'json' | 'csv' }
                header?: never
                path?: never
                cookie?: never
            }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { [key: string]: unknown }; 'text/csv': string }
                }
            }
        }
    }
    '/api/food-catalog/barcode/{barcode}': {
        get: {
            parameters: { query?: never; header?: never; path: { barcode: string }; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                barcode: string | null
                                brand: string | null
                                caloriesPer100g: number | null
                                carbsPer100g: number | null
                                catalogId: string | null
                                catalogSource: string | null
                                fatPer100g: number | null
                                fiberPer100g: number | null
                                name: string
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                potassiumPer100g: number | null
                                proteinPer100g: number | null
                                saturatedFatPer100g: number | null
                                servingGrams: number
                                servingName: string
                                servingOptions: Array<{ grams: number; label: string }>
                                sodiumPer100g: number | null
                                sugarPer100g: number | null
                            }
                        }
                    }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                502: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                503: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/food-catalog/search': {
        get: {
            parameters: { query: { q: string }; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                barcode: string | null
                                brand: string | null
                                caloriesPer100g: number | null
                                carbsPer100g: number | null
                                catalogId: string | null
                                catalogSource: string | null
                                fatPer100g: number | null
                                fiberPer100g: number | null
                                name: string
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                potassiumPer100g: number | null
                                proteinPer100g: number | null
                                saturatedFatPer100g: number | null
                                servingGrams: number
                                servingName: string
                                servingOptions: Array<{ grams: number; label: string }>
                                sodiumPer100g: number | null
                                sugarPer100g: number | null
                            }>
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                502: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                503: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/food-categories': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{ foodIds: Array<string>; id: string; name: string }>
                        }
                    }
                }
            }
        }
    }
    '/api/foods': {
        get: {
            parameters: { query?: { q?: string }; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                barcode: string | null
                                brand: string | null
                                caloriesPer100g: number | null
                                carbsPer100g: number | null
                                catalogId: string | null
                                catalogSource: string | null
                                fatPer100g: number | null
                                favorite: boolean
                                fiberPer100g: number | null
                                id: string
                                name: string
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                potassiumPer100g: number | null
                                proteinPer100g: number | null
                                saturatedFatPer100g: number | null
                                servingGrams: number
                                servingName: string
                                servingOptions: Array<{ grams: number; label: string }>
                                sodiumPer100g: number | null
                                sugarPer100g: number | null
                                version: number
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
                        barcode?: string
                        brand?: string
                        caloriesPer100g?: number | null
                        carbsPer100g?: number | null
                        catalogId?: string
                        catalogSource?: string
                        fatPer100g?: number | null
                        favorite: boolean
                        fiberPer100g?: number | null
                        name: string
                        nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                        potassiumPer100g?: number | null
                        proteinPer100g?: number | null
                        saturatedFatPer100g?: number | null
                        servingGrams: number
                        servingName: string
                        servingOptions: Array<{ grams: number; label: string }>
                        sodiumPer100g?: number | null
                        sugarPer100g?: number | null
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                barcode: string | null
                                brand: string | null
                                caloriesPer100g: number | null
                                carbsPer100g: number | null
                                catalogId: string | null
                                catalogSource: string | null
                                fatPer100g: number | null
                                favorite: boolean
                                fiberPer100g: number | null
                                id: string
                                name: string
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                potassiumPer100g: number | null
                                proteinPer100g: number | null
                                saturatedFatPer100g: number | null
                                servingGrams: number
                                servingName: string
                                servingOptions: Array<{ grams: number; label: string }>
                                sodiumPer100g: number | null
                                sugarPer100g: number | null
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/foods/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: { content: { 'application/json': { version: number } } }
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            error: string
                            plannedMeals?: number
                            recipes?: Array<{ id: string; name: string }>
                        }
                    }
                }
            }
        }
        patch: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        barcode?: string
                        brand?: string
                        caloriesPer100g?: number | null
                        carbsPer100g?: number | null
                        catalogId?: string
                        catalogSource?: string
                        fatPer100g?: number | null
                        favorite?: boolean
                        fiberPer100g?: number | null
                        name?: string
                        nutritionQuality?: 'complete' | 'estimated' | 'incomplete'
                        potassiumPer100g?: number | null
                        proteinPer100g?: number | null
                        saturatedFatPer100g?: number | null
                        servingGrams?: number
                        servingName?: string
                        servingOptions?: Array<{ grams: number; label: string }>
                        sodiumPer100g?: number | null
                        sugarPer100g?: number | null
                        version: number
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                barcode: string | null
                                brand: string | null
                                caloriesPer100g: number | null
                                carbsPer100g: number | null
                                catalogId: string | null
                                catalogSource: string | null
                                fatPer100g: number | null
                                favorite: boolean
                                fiberPer100g: number | null
                                id: string
                                name: string
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                potassiumPer100g: number | null
                                proteinPer100g: number | null
                                saturatedFatPer100g: number | null
                                servingGrams: number
                                servingName: string
                                servingOptions: Array<{ grams: number; label: string }>
                                sodiumPer100g: number | null
                                sugarPer100g: number | null
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/foods/{id}/categories': {
        put: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: { content: { 'application/json': { categoryIds: Array<string> } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { data: { categoryIds: Array<string> } } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/foods/import': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        duplicateStrategy: 'skip' | 'update' | 'create'
                        foods: Array<{
                            barcode?: string
                            brand?: string
                            caloriesPer100g?: number | null
                            carbsPer100g?: number | null
                            catalogId?: string
                            catalogSource?: string
                            fatPer100g?: number | null
                            favorite: boolean
                            fiberPer100g?: number | null
                            name: string
                            nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                            potassiumPer100g?: number | null
                            proteinPer100g?: number | null
                            saturatedFatPer100g?: number | null
                            servingGrams: number
                            servingName: string
                            servingOptions: Array<{ grams: number; label: string }>
                            sodiumPer100g?: number | null
                            sugarPer100g?: number | null
                        }>
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                created: number
                                failed: number
                                results: Array<{
                                    id?: string
                                    index: number
                                    reason?: string
                                    status: 'created' | 'updated' | 'skipped' | 'failed'
                                }>
                                skipped: number
                                updated: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
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
                404: {
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
    '/api/health': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { status: 'ok' } }
                }
            }
        }
    }
    '/api/health-records/rebuild': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { data: { records: number } } }
                }
            }
        }
    }
    '/api/journal': {
        get: {
            parameters: {
                query?: {
                    before?: string
                    category?: 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'
                    from?: string
                    limit?: number
                    source?: string
                    to?: string
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
                            data: Array<{
                                category:
                                    'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'
                                definitionId: string
                                detail: string
                                detailView?:
                                    | {
                                          kind: 'sleep'
                                          stages: Array<{
                                              end: string
                                              start: string
                                              type: 'awake' | 'rem' | 'light' | 'deep' | 'unknown'
                                          }>
                                      }
                                    | {
                                          kind: 'meal'
                                          mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                          nutrients: { [key: string]: number }
                                          nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                          serving?: { amount: number; unit: 'g' | 'serving' }
                                          sourceItem?: { id: string; kind: 'food' | 'recipe' }
                                      }
                                deviceName?: string
                                editable?: boolean
                                endedAt?: string
                                entityId?: string
                                entityType?: 'meal' | 'observation' | 'health_record'
                                id: string
                                observedAt: string
                                source: string
                                startedAt?: string
                                title: string
                                version: number
                            }>
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/journal/{id}': {
        get: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                category:
                                    'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'
                                definitionId: string
                                detail: string
                                detailView?:
                                    | {
                                          kind: 'sleep'
                                          stages: Array<{
                                              end: string
                                              start: string
                                              type: 'awake' | 'rem' | 'light' | 'deep' | 'unknown'
                                          }>
                                      }
                                    | {
                                          kind: 'meal'
                                          mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                          nutrients: { [key: string]: number }
                                          nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                          serving?: { amount: number; unit: 'g' | 'serving' }
                                          sourceItem?: { id: string; kind: 'food' | 'recipe' }
                                      }
                                deviceName?: string
                                editable?: boolean
                                endedAt?: string
                                entityId?: string
                                entityType?: 'meal' | 'observation' | 'health_record'
                                id: string
                                observedAt: string
                                source: string
                                startedAt?: string
                                title: string
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/mcp/access-log': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                action: string
                                actor: string
                                createdAt: string
                                id: string
                                targetId: string | null
                            }>
                        }
                    }
                }
            }
        }
    }
    '/api/mcp/browser-origins': {
        put: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: { content: { 'application/json': { origins: Array<string> } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { allowedOrigins: Array<string> } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/mcp/clients': {
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        dateFrom?: string
                        dateTo?: string
                        expiresAt?: string
                        name: string
                        scopes: Array<
                            | 'observations'
                            | 'meals'
                            | 'journal'
                            | 'preferences'
                            | 'observations:write'
                            | 'meals:write'
                            | 'checkins:write'
                        >
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            client: {
                                createdAt: string
                                dateFrom: string | null
                                dateTo: string | null
                                expiresAt: string | null
                                id: string
                                lastUsedAt: string | null
                                name: string
                                revokedAt: string | null
                                scopes: Array<string>
                            }
                            token: string
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/mcp/clients/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: { 204: { headers: { [name: string]: unknown }; content?: never } }
        }
    }
    '/api/mcp/clients/{id}/permanent': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: { 204: { headers: { [name: string]: unknown }; content?: never } }
        }
    }
    '/api/mcp/status': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            allowedOrigins: Array<string>
                            clients: Array<{
                                createdAt: string
                                dateFrom: string | null
                                dateTo: string | null
                                expiresAt: string | null
                                id: string
                                lastUsedAt: string | null
                                name: string
                                revokedAt: string | null
                                scopes: Array<string>
                            }>
                            enabled: boolean
                        }
                    }
                }
            }
        }
        patch: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: { content: { 'application/json': { enabled: boolean } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { enabled: boolean } }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/meals': {
        get: {
            parameters: {
                query?: { from?: string; to?: string }
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
                                eatenAt: string
                                favorite: boolean
                                id: string
                                mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                name: string
                                nutrientSnapshot: { [key: string]: number }
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                serving?: { amount: number; unit: 'g' | 'serving' }
                                sourceItem?: { id: string; kind: 'food' | 'recipe' }
                                version: number
                            }>
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        eatenAt: string
                        favorite: boolean
                        foodId?: string
                        id?: string
                        mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                        name: string
                        nutrients: { [key: string]: number }
                        nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                        recipeId?: string
                        serving?: { amount: number; unit: 'g' | 'serving' }
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                eatenAt: string
                                favorite: boolean
                                id: string
                                mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                name: string
                                nutrientSnapshot: { [key: string]: number }
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                serving?: { amount: number; unit: 'g' | 'serving' }
                                sourceItem?: { id: string; kind: 'food' | 'recipe' }
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/meals/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody?: never
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
        patch: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        eatenAt?: string
                        favorite?: boolean
                        foodId?: string | null
                        mealType?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                        name?: string
                        nutrients?: { [key: string]: number }
                        nutritionQuality?: 'complete' | 'estimated' | 'incomplete'
                        recipeId?: string | null
                        serving?: { amount: number; unit: 'g' | 'serving' } | null
                        version: number
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                eatenAt: string
                                favorite: boolean
                                id: string
                                mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                name: string
                                nutrientSnapshot: { [key: string]: number }
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                serving?: { amount: number; unit: 'g' | 'serving' }
                                sourceItem?: { id: string; kind: 'food' | 'recipe' }
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
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
    '/api/openapi.json': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { [key: string]: unknown } }
                }
            }
        }
    }
    '/api/plan-items': {
        get: {
            parameters: {
                query?: { from?: string; to?: string }
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
                                id: string
                                kind: 'meal'
                                meal: {
                                    amount: number
                                    fulfilledAmount: number
                                    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                    reference:
                                        | { id: string; name: string; type: 'food' }
                                        | { id: string; name: string; type: 'recipe' }
                                        | { id: string; name: string; type: 'category' }
                                    unit: 'g' | 'serving'
                                }
                                position: number
                                resultObservationId: string | null
                                scheduledDate: string
                                scheduledTime: string | null
                                skippedAt: string | null
                                version: number
                            }>
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        amount: number
                        mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                        position?: number
                        reference:
                            | { id: string; type: 'food' }
                            | { id: string; type: 'recipe' }
                            | { id: string; type: 'category' }
                        scheduledDate: string
                        scheduledTime?: string | null
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                id: string
                                kind: 'meal'
                                meal: {
                                    amount: number
                                    fulfilledAmount: number
                                    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                    reference:
                                        | { id: string; name: string; type: 'food' }
                                        | { id: string; name: string; type: 'recipe' }
                                        | { id: string; name: string; type: 'category' }
                                    unit: 'g' | 'serving'
                                }
                                position: number
                                resultObservationId: string | null
                                scheduledDate: string
                                scheduledTime: string | null
                                skippedAt: string | null
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/plan-items/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: { content: { 'application/json': { version: number } } }
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
        patch: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        amount?: number
                        mealType?: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                        position?: number
                        reference?:
                            | { id: string; type: 'food' }
                            | { id: string; type: 'recipe' }
                            | { id: string; type: 'category' }
                        scheduledDate?: string
                        scheduledTime?: string | null
                        version: number
                    }
                }
            }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                id: string
                                kind: 'meal'
                                meal: {
                                    amount: number
                                    fulfilledAmount: number
                                    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                    reference:
                                        | { id: string; name: string; type: 'food' }
                                        | { id: string; name: string; type: 'recipe' }
                                        | { id: string; name: string; type: 'category' }
                                    unit: 'g' | 'serving'
                                }
                                position: number
                                resultObservationId: string | null
                                scheduledDate: string
                                scheduledTime: string | null
                                skippedAt: string | null
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/plan-items/{id}/log': {
        post: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: {
                content: {
                    'application/json': {
                        amount?: number
                        eatenAt: string
                        foodId?: string
                        version: number
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: { fulfilledAmount: number; observationId: string }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/plan-items/{id}/skip': {
        post: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: { content: { 'application/json': { skipped: boolean; version: number } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                id: string
                                kind: 'meal'
                                meal: {
                                    amount: number
                                    fulfilledAmount: number
                                    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                    reference:
                                        | { id: string; name: string; type: 'food' }
                                        | { id: string; name: string; type: 'recipe' }
                                        | { id: string; name: string; type: 'category' }
                                    unit: 'g' | 'serving'
                                }
                                position: number
                                resultObservationId: string | null
                                scheduledDate: string
                                scheduledTime: string | null
                                skippedAt: string | null
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/plan-schedules': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                id: string
                                meal: {
                                    amount: number
                                    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                    reference:
                                        | { id: string; name: string; type: 'food' }
                                        | { id: string; name: string; type: 'recipe' }
                                        | { id: string; name: string; type: 'category' }
                                    unit: 'g' | 'serving'
                                }
                                scheduledTime: string | null
                                startDate: string
                                version: number
                                weekdays: Array<number>
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
                        amount: number
                        mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                        reference:
                            | { id: string; type: 'food' }
                            | { id: string; type: 'recipe' }
                            | { id: string; type: 'category' }
                        scheduledTime?: string | null
                        startDate: string
                        weekdays: Array<number>
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                id: string
                                meal: {
                                    amount: number
                                    mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
                                    reference:
                                        | { id: string; name: string; type: 'food' }
                                        | { id: string; name: string; type: 'recipe' }
                                        | { id: string; name: string; type: 'category' }
                                    unit: 'g' | 'serving'
                                }
                                scheduledTime: string | null
                                startDate: string
                                version: number
                                weekdays: Array<number>
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/plan-schedules/{id}': {
        delete: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: { content: { 'application/json': { fromDate: string; version: number } } }
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
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
    '/api/ready': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { status: 'ready' } }
                }
                503: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { status: 'unavailable' } }
                }
            }
        }
    }
    '/api/recipes': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: Array<{
                                favorite: boolean
                                id: string
                                items: Array<{
                                    foodId: string
                                    foodName: string
                                    grams: number
                                    id: string
                                    recipeId?: string
                                }>
                                name: string
                                nutrientsPerServing: { [key: string]: number | null }
                                nutritionQuality: 'complete' | 'estimated' | 'incomplete'
                                servings: number
                                version: number
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
                        favorite: boolean
                        items: Array<{ foodId: string; grams: number }>
                        name: string
                        servings: number
                    }
                }
            }
            responses: {
                201: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                favorite: boolean
                                id: string
                                items: Array<{
                                    foodId: string
                                    grams: number
                                    id: string
                                    recipeId?: string
                                }>
                                name: string
                                servings: number
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/recipes/{id}': {
        patch: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: { content: { 'application/json': { servings: number; version: number } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': {
                            data: {
                                favorite: boolean
                                id: string
                                name: string
                                servings: number
                                version: number
                            }
                        }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
    '/api/recipes/{id}/favorite': {
        patch: {
            parameters: { query?: never; header?: never; path: { id: string }; cookie?: never }
            requestBody: { content: { 'application/json': { favorite: boolean; version: number } } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: {
                        'application/json': { data: { favorite: boolean; version: number } }
                    }
                }
                400: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                404: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                409: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
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
    '/mcp': {
        get: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                405: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
        options: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody?: never
            responses: {
                204: { headers: { [name: string]: unknown }; content?: never }
                403: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
        post: {
            parameters: { query?: never; header?: never; path?: never; cookie?: never }
            requestBody: { content: { 'application/json': unknown } }
            responses: {
                200: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': unknown }
                }
                401: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
                429: {
                    headers: { [name: string]: unknown }
                    content: { 'application/json': { error: string; requestId?: string } }
                }
            }
        }
    }
}
