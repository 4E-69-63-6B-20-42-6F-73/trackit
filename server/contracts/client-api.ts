import { z } from 'zod'
import {
    foodImportSchema,
    foodInputSchema,
    foodUpdateSchema,
    mealInputSchema,
    mealUpdateSchema,
    recipeInputSchema,
    recipeUpdateSchema,
} from '../data/types.js'
import {
    maintenanceDateRangeSchema,
    providerRecordMaintenanceSchema,
} from '../data/maintenance-range.js'

const dataResponse = <T extends z.ZodType>(schema: T) => z.object({ data: schema })
const errorResponse = z.object({ error: z.string(), requestId: z.string().optional() })
const dateTime = z.string().datetime()
const nullableDateTime = dateTime.nullable()
const uuid = z.string().uuid()
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const scheduledTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const mealType = z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack'])
const nutritionQuality = z.enum(['complete', 'estimated', 'incomplete'])
const categoryId = z.string().regex(/^[a-z0-9-]{1,60}$/)
const planReference = z.discriminatedUnion('type', [
    z.object({ type: z.literal('food'), id: uuid }),
    z.object({ type: z.literal('recipe'), id: uuid }),
    z.object({ type: z.literal('category'), id: categoryId }),
])
const namedPlanReference = z.discriminatedUnion('type', [
    z.object({ type: z.literal('food'), id: uuid, name: z.string() }),
    z.object({ type: z.literal('recipe'), id: uuid, name: z.string() }),
    z.object({ type: z.literal('category'), id: categoryId, name: z.string() }),
])

const journalDetail = z.union([
    z.object({
        kind: z.literal('sleep'),
        stages: z.array(
            z.object({
                type: z.enum(['awake', 'rem', 'light', 'deep', 'unknown']),
                start: dateTime,
                end: dateTime,
            }),
        ),
    }),
    z.object({
        kind: z.literal('meal'),
        mealType,
        serving: z.object({ amount: z.number(), unit: z.enum(['g', 'serving']) }).optional(),
        nutrients: z.record(z.string(), z.number()),
        nutritionQuality,
        sourceItem: z.object({ kind: z.enum(['food', 'recipe']), id: z.string() }).optional(),
    }),
])

const journalEntry = z.object({
    id: z.string(),
    definitionId: z.string(),
    entityType: z.enum(['meal', 'observation', 'health_record']).optional(),
    entityId: z.string().optional(),
    editable: z.boolean().optional(),
    category: z.enum(['Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins']),
    title: z.string(),
    detail: z.string(),
    source: z.string(),
    deviceName: z.string().optional(),
    observedAt: dateTime,
    startedAt: dateTime.optional(),
    endedAt: dateTime.optional(),
    version: z.number(),
    detailView: journalDetail.optional(),
})

const foodRecord = z.object({
    id: uuid,
    name: z.string(),
    brand: z.string().nullable(),
    barcode: z.string().nullable(),
    catalogSource: z.string().nullable(),
    catalogId: z.string().nullable(),
    caloriesPer100g: z.number().nullable(),
    proteinPer100g: z.number().nullable(),
    carbsPer100g: z.number().nullable(),
    fatPer100g: z.number().nullable(),
    fiberPer100g: z.number().nullable(),
    sugarPer100g: z.number().nullable(),
    saturatedFatPer100g: z.number().nullable(),
    sodiumPer100g: z.number().nullable(),
    potassiumPer100g: z.number().nullable(),
    servingName: z.string(),
    servingGrams: z.number(),
    servingOptions: z.array(z.object({ label: z.string(), grams: z.number() })),
    favorite: z.boolean(),
    nutritionQuality,
    version: z.number(),
})

const catalogFoodRecord = foodRecord.omit({ id: true, favorite: true, version: true })

const mealRecord = z.object({
    id: z.string(),
    name: z.string(),
    mealType,
    eatenAt: dateTime,
    nutrientSnapshot: z.record(z.string(), z.number()),
    favorite: z.boolean(),
    version: z.number(),
    nutritionQuality,
    serving: z.object({ amount: z.number(), unit: z.enum(['g', 'serving']) }).optional(),
    sourceItem: z.object({ kind: z.enum(['food', 'recipe']), id: z.string() }).optional(),
})

const recipeItem = z.object({
    id: uuid,
    recipeId: uuid.optional(),
    foodId: uuid,
    foodName: z.string().optional(),
    grams: z.number(),
})
const recipeBase = z.object({
    id: uuid,
    name: z.string(),
    servings: z.number(),
    favorite: z.boolean(),
    version: z.number(),
})
const recipeRecord = recipeBase.extend({
    items: z.array(recipeItem.extend({ foodName: z.string() })),
    nutrientsPerServing: z.record(z.string(), z.number().nullable()),
    nutritionQuality,
})
const createdRecipeRecord = recipeBase.extend({
    items: z.array(recipeItem.omit({ foodName: true })),
})

const foodImportResult = z.object({
    results: z.array(
        z.object({
            index: z.number().int(),
            status: z.enum(['created', 'updated', 'skipped', 'failed']),
            id: z.string().optional(),
            reason: z.string().optional(),
        }),
    ),
    created: z.number().int(),
    updated: z.number().int(),
    skipped: z.number().int(),
    failed: z.number().int(),
})

const foodDeleteConflict = z.object({
    error: z.string(),
    recipes: z.array(z.object({ id: uuid, name: z.string() })).optional(),
    plannedMeals: z.number().int().optional(),
})

const foodCategory = z.object({ id: categoryId, name: z.string(), foodIds: z.array(uuid) })
const foodCategoryMembership = z.object({ categoryIds: z.array(categoryId).max(20) })

const planItem = z.object({
    id: uuid,
    kind: z.literal('meal'),
    scheduledDate: dateKey,
    scheduledTime: scheduledTime.nullable(),
    position: z.number().int(),
    skippedAt: nullableDateTime,
    resultObservationId: z.string().nullable(),
    version: z.number().int(),
    meal: z.object({
        mealType,
        reference: namedPlanReference,
        amount: z.number(),
        unit: z.enum(['g', 'serving']),
        fulfilledAmount: z.number(),
    }),
})
const planItemInput = z.object({
    scheduledDate: dateKey,
    scheduledTime: scheduledTime.nullable().optional(),
    mealType,
    reference: planReference,
    amount: z.number().positive(),
    position: z.number().int().nonnegative().optional(),
})
const planItemUpdate = planItemInput.partial().extend({ version: z.number().int().positive() })
const planSkipInput = z.object({ version: z.number().int().positive(), skipped: z.boolean() })
const planLogInput = z.object({
    version: z.number().int().positive(),
    eatenAt: dateTime,
    amount: z.number().positive().optional(),
    foodId: uuid.optional(),
})
const planLogResult = z.object({ observationId: z.string(), fulfilledAmount: z.number() })
const planDeleteInput = z.object({ version: z.number().int().positive() })
const weekdays = z.array(z.number().int().min(0).max(6)).min(1).max(7)
const planSchedule = z.object({
    id: uuid,
    startDate: dateKey,
    scheduledTime: scheduledTime.nullable(),
    weekdays,
    version: z.number().int(),
    meal: z.object({
        mealType,
        reference: namedPlanReference,
        amount: z.number(),
        unit: z.enum(['g', 'serving']),
    }),
})
const planScheduleInput = z.object({
    startDate: dateKey,
    scheduledTime: scheduledTime.nullable().optional(),
    mealType,
    reference: planReference,
    amount: z.number().positive(),
    weekdays,
})
const planScheduleStop = z.object({ version: z.number().int().positive(), fromDate: dateKey })

const deviceSync = z.object({
    recordType: z.string(),
    status: z.string(),
    lastSyncedAt: nullableDateTime,
    diagnostic: z.string().nullable(),
})
const deviceRecord = z.object({
    id: uuid,
    name: z.string(),
    keyFingerprint: z.string(),
    status: z.string(),
    confirmedAt: nullableDateTime,
    configuredAt: nullableDateTime,
    revokedAt: nullableDateTime,
    lastSeenAt: nullableDateTime,
    createdAt: dateTime,
    sync: z.array(deviceSync),
})
const pairingCode = z.object({ code: z.string(), expiresAt: dateTime, serverIdentity: z.string() })
const pairingRequest = z.object({
    code: z.string().regex(/^\d{4}-\d{4}$/),
    name: z.string(),
    keyFingerprint: z.string(),
    publicKey: z.string(),
    serverIdentity: z.string(),
})
const pairingResponse = z.object({
    deviceId: uuid,
    credential: z.string(),
    status: z.string(),
    serverIdentity: z.string(),
})
const deviceStatus = z.object({ id: uuid, status: z.string(), revokedAt: nullableDateTime })
const healthRecordInput = z.object({
    provider: z.string(),
    recordType: z.string(),
    externalId: z.string(),
    externalVersion: z.number().int().nonnegative(),
    startTime: dateTime,
    endTime: dateTime.optional(),
    dataOrigin: z.string().optional(),
    recordingMethod: z.string().optional(),
    device: z.record(z.string(), z.unknown()).optional(),
    payload: z.record(z.string(), z.unknown()),
    lastModifiedTime: dateTime.optional(),
    deleted: z.boolean().optional(),
})
const healthRecordBatch = z.object({
    idempotencyKey: uuid,
    records: z.array(healthRecordInput).max(1000),
})
const healthRecordUploadResult = z.object({ duplicate: z.boolean(), accepted: z.number().int() })
const healthRecordReconcile = z.object({
    recordType: z.string(),
    since: dateTime,
    presentExternalIds: z.array(z.string()),
})
const healthRecordReconcileResult = z
    .object({
        missing: z.number().int().optional(),
        removed: z.number().int().optional(),
    })
    .passthrough()
const cursorUpdate = z.object({
    recordType: z.string(),
    cursor: z.string().nullable(),
    status: z.enum(['idle', 'syncing', 'complete', 'permission_revoked', 'error']),
})
const deviceAuthHeaders = z.object({
    authorization: z.string().optional(),
    'x-device-key-fingerprint': z.string().optional(),
    'x-device-timestamp': z.string().optional(),
    'x-device-id': z.string().optional(),
    'x-device-nonce': z.string().optional(),
    'x-device-signature': z.string().optional(),
})

const mcpScope = z.enum([
    'observations',
    'meals',
    'journal',
    'preferences',
    'observations:write',
    'meals:write',
    'checkins:write',
])
const mcpClient = z.object({
    id: uuid,
    name: z.string(),
    scopes: z.array(z.string()),
    dateFrom: nullableDateTime,
    dateTo: nullableDateTime,
    expiresAt: nullableDateTime,
    revokedAt: nullableDateTime,
    lastUsedAt: nullableDateTime,
    createdAt: dateTime,
})
const mcpStatus = z.object({
    enabled: z.boolean(),
    clients: z.array(mcpClient),
    allowedOrigins: z.array(z.string()),
})
const mcpIssueInput = z.object({
    name: z.string(),
    scopes: z.array(mcpScope).min(1),
    dateFrom: dateTime.optional(),
    dateTo: dateTime.optional(),
    expiresAt: dateTime.optional(),
})
const mcpIssueResult = z.object({ client: mcpClient, token: z.string() })
const mcpAccessEvent = z.object({
    id: uuid,
    actor: z.string(),
    action: z.string(),
    targetId: z.string().nullable(),
    createdAt: dateTime,
})

const authStatus = z.object({ configured: z.boolean(), authenticated: z.boolean() })
const passwordInput = z.object({ password: z.string().min(12).max(256) })
const okStatus = z.object({ status: z.literal('ok') })
const session = z.object({
    id: uuid,
    userAgent: z.string().nullable(),
    ipAddress: z.string().nullable(),
    createdAt: dateTime,
    expiresAt: dateTime,
    current: z.boolean(),
})
const auditEvent = z.object({
    id: uuid,
    action: z.string(),
    actor: z.string(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    createdAt: dateTime,
})
const passkeyOptions = z.object({ attemptId: uuid, options: z.unknown() })
const passkeyVerify = z.object({ attemptId: uuid, response: z.unknown() })

export const clientApiContractSchemas = {
    errorResponse,
    journalQuery: z.object({
        from: dateTime.optional(),
        to: dateTime.optional(),
        before: dateTime.optional(),
        category: z.enum(['Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins']).optional(),
        source: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
    }),
    journalResponse: dataResponse(z.array(journalEntry)),
    journalEntryResponse: dataResponse(journalEntry),
    mealInput: mealInputSchema,
    mealUpdate: mealUpdateSchema,
    mealResponse: dataResponse(mealRecord),
    mealsResponse: dataResponse(z.array(mealRecord)),
    foodInput: foodInputSchema,
    foodUpdate: foodUpdateSchema,
    foodResponse: dataResponse(foodRecord),
    foodsResponse: dataResponse(z.array(foodRecord)),
    foodImportInput: foodImportSchema,
    foodImportResponse: dataResponse(foodImportResult),
    foodDeleteInput: z.object({ version: z.number().int().positive() }),
    foodDeleteConflict,
    catalogFoodResponse: dataResponse(catalogFoodRecord),
    catalogFoodsResponse: dataResponse(z.array(catalogFoodRecord)),
    recipeInput: recipeInputSchema,
    recipeUpdate: recipeUpdateSchema,
    recipesResponse: dataResponse(z.array(recipeRecord)),
    createdRecipeResponse: dataResponse(createdRecipeRecord),
    recipeUpdateResponse: dataResponse(recipeBase),
    recipeFavoriteInput: z.object({ favorite: z.boolean(), version: z.number().int().positive() }),
    recipeFavoriteResponse: dataResponse(
        z.object({ favorite: z.boolean(), version: z.number().int() }),
    ),
    foodCategoriesResponse: dataResponse(z.array(foodCategory)),
    foodCategoryMembershipInput: foodCategoryMembership,
    foodCategoryMembershipResponse: dataResponse(foodCategoryMembership),
    planItemInput,
    planItemUpdate,
    planSkipInput,
    planLogInput,
    planDeleteInput,
    planItemResponse: dataResponse(planItem),
    planItemsResponse: dataResponse(z.array(planItem)),
    planLogResponse: dataResponse(planLogResult),
    planScheduleInput,
    planScheduleStop,
    planScheduleResponse: dataResponse(planSchedule),
    planSchedulesResponse: dataResponse(z.array(planSchedule)),
    pairingCode,
    pairingRequest,
    pairingResponse,
    deviceRecordResponse: dataResponse(deviceRecord),
    devicesResponse: dataResponse(z.array(deviceRecord)),
    deviceStatusResponse: dataResponse(deviceStatus),
    healthRecordBatch,
    healthRecordUploadResult,
    healthRecordReconcile,
    healthRecordReconcileResult,
    cursorUpdate,
    deviceAuthHeaders,
    mcpStatus,
    mcpAccessLogResponse: dataResponse(z.array(mcpAccessEvent)),
    mcpEnabledInput: z.object({ enabled: z.boolean() }),
    mcpEnabledResponse: z.object({ enabled: z.boolean() }),
    mcpOriginsInput: z.object({ origins: z.array(z.string().url()).max(20) }),
    mcpOriginsResponse: z.object({ allowedOrigins: z.array(z.string()) }),
    mcpIssueInput,
    mcpIssueResult,
    maintenanceDateRange: maintenanceDateRangeSchema,
    providerRecordMaintenance: providerRecordMaintenanceSchema,
    projectionRebuildResponse: dataResponse(z.object({ queuedDates: z.number().int() })),
    providerRederiveResponse: dataResponse(
        z.object({
            sourceRecords: z.number().int(),
            canonicalObservations: z.number().int(),
            queuedProjectionDates: z.number().int(),
        }),
    ),
    ownerDeleteInput: z.object({ confirmation: z.literal('DELETE ALL TRACKIT DATA') }),
    authStatus,
    passwordInput,
    recoveryInput: z.object({ code: z.string().min(12).max(32) }),
    setupResponse: z.object({ recoveryCodes: z.array(z.string()) }),
    okStatus,
    passkeyOptions,
    passkeyVerify,
    passkeyVerified: z.object({ verified: z.literal(true) }),
    sessionsResponse: dataResponse(z.array(session)),
    auditResponse: dataResponse(z.array(auditEvent)),
} as const
