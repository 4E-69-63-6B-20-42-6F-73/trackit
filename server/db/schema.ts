import {
    boolean,
    doublePrecision,
    integer,
    bigint,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core'

export const sources = pgTable('sources', {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    externalOrigin: text('external_origin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const healthRecords = pgTable(
    'health_records',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: text('user_id').notNull().default('owner'),
        connector: text('connector').notNull().default('direct'),
        provider: text('provider').notNull(),
        recordType: text('record_type').notNull(),
        externalId: text('external_id').notNull(),
        externalVersion: bigint('external_version', { mode: 'number' }).notNull().default(1),
        startTime: timestamp('start_time', { withTimezone: true }).notNull(),
        endTime: timestamp('end_time', { withTimezone: true }),
        dataOrigin: text('data_origin'),
        recordingMethod: text('recording_method'),
        device: jsonb('device').notNull().default({}),
        payload: jsonb('payload').notNull().default({}),
        lastModifiedTime: timestamp('last_modified_time', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    table => [
        uniqueIndex('health_record_source_identity_idx').on(
            table.userId,
            table.connector,
            table.externalId,
        ),
        index('health_record_type_start_idx').on(table.recordType, table.startTime),
        index('health_record_origin_idx').on(table.dataOrigin),
    ],
)

export const observations = pgTable(
    'observations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: text('user_id').notNull().default('owner'),
        definitionId: text('definition_id').notNull(),
        definitionVersion: integer('definition_version').notNull().default(1),
        valueType: text('value_type').notNull().default('number'),
        origin: text('origin').notNull().default('manual'),
        state: text('state').notNull().default('active'),
        canonicalValue: doublePrecision('canonical_value'),
        canonicalUnit: text('canonical_unit'),
        originalValue: doublePrecision('original_value'),
        originalUnit: text('original_unit'),
        textValue: text('text_value'),
        booleanValue: boolean('boolean_value'),
        categoryValue: text('category_value'),
        title: text('title'),
        category: text('category'),
        observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
        endedAt: timestamp('ended_at', { withTimezone: true }),
        recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
        sourceId: uuid('source_id').references(() => sources.id),
        externalId: text('external_id'),
        kind: text('kind').notNull().default('raw_metric'),
        sourceRecordId: uuid('source_record_id').references(() => healthRecords.id, {
            onDelete: 'cascade',
        }),
        derivation: text('derivation'),
        derivationVersion: integer('derivation_version'),
        metadata: jsonb('metadata').notNull().default({}),
        attributes: jsonb('attributes').notNull().default({}),
        excluded: boolean('excluded').notNull().default(false),
        version: bigint('version', { mode: 'number' }).notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    table => [
        uniqueIndex('observation_external_source_idx').on(table.sourceId, table.externalId),
        uniqueIndex('observation_record_definition_idx').on(
            table.sourceRecordId,
            table.definitionId,
            table.derivationVersion,
        ),
        index('observation_definition_observed_idx').on(table.definitionId, table.observedAt),
        index('observation_category_observed_idx').on(table.category, table.observedAt),
    ],
)

export const observationRelations = pgTable(
    'observation_relations',
    {
        parentObservationId: uuid('parent_observation_id')
            .notNull()
            .references(() => observations.id, { onDelete: 'cascade' }),
        childObservationId: uuid('child_observation_id')
            .notNull()
            .references(() => observations.id, { onDelete: 'cascade' }),
        kind: text('kind').notNull(),
        role: text('role').notNull(),
        ordinal: integer('ordinal').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('observation_relation_identity_idx').on(
            table.parentObservationId,
            table.childObservationId,
            table.kind,
            table.role,
        ),
        index('observation_relation_child_idx').on(table.childObservationId),
    ],
)

// Rebuildable materialization of system-derived observations. These rows are
// deliberately separate from observations: they accelerate reads without
// becoming authoritative facts or obscuring their input lineage.
export const derivedObservations = pgTable(
    'derived_observations',
    {
        id: text('id').primaryKey(),
        userId: text('user_id').notNull().default('owner'),
        date: text('date').notNull(),
        definitionId: text('definition_id').notNull(),
        canonicalValue: doublePrecision('canonical_value').notNull(),
        canonicalUnit: text('canonical_unit').notNull(),
        observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
        endedAt: timestamp('ended_at', { withTimezone: true }),
        derivation: text('derivation').notNull(),
        derivationVersion: integer('derivation_version').notNull(),
        resolutionVersion: integer('resolution_version').notNull(),
        timezone: text('timezone').notNull(),
        inputFingerprint: text('input_fingerprint').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        index('derived_observation_definition_observed_idx').on(
            table.definitionId,
            table.observedAt,
        ),
        index('derived_observation_materialization_idx').on(
            table.userId,
            table.date,
            table.resolutionVersion,
            table.derivationVersion,
        ),
    ],
)

export const derivedObservationInputs = pgTable(
    'derived_observation_inputs',
    {
        derivedObservationId: text('derived_observation_id')
            .notNull()
            .references(() => derivedObservations.id, { onDelete: 'cascade' }),
        inputObservationId: text('input_observation_id').notNull(),
        inputVersion: bigint('input_version', { mode: 'number' }).notNull(),
        role: text('role').notNull().default('input'),
        ordinal: integer('ordinal').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('derived_observation_input_identity_idx').on(
            table.derivedObservationId,
            table.inputObservationId,
            table.role,
        ),
        index('derived_observation_input_reverse_idx').on(table.inputObservationId),
    ],
)

export const dailyMetrics = pgTable(
    'daily_metrics',
    {
        userId: text('user_id').notNull().default('owner'),
        date: text('date').notNull(),
        definitionId: text('definition_id').notNull(),
        value: doublePrecision('value').notNull(),
        unit: text('unit').notNull(),
        derivationVersion: integer('derivation_version').notNull(),
        resolutionVersion: integer('resolution_version').notNull().default(1),
        timezone: text('timezone').notNull().default('UTC'),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('daily_metric_identity_idx').on(table.userId, table.date, table.definitionId),
    ],
)

export const dailyProjectionRuns = pgTable(
    'daily_projection_runs',
    {
        userId: text('user_id').notNull().default('owner'),
        date: text('date').notNull(),
        derivationVersion: integer('derivation_version').notNull(),
        resolutionVersion: integer('resolution_version').notNull(),
        timezone: text('timezone').notNull(),
        status: text('status').notNull().default('complete'),
        completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [uniqueIndex('daily_projection_run_identity_idx').on(table.userId, table.date)],
)

export const projectionDirtyDates = pgTable(
    'projection_dirty_dates',
    {
        userId: text('user_id').notNull().default('owner'),
        date: text('date').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [uniqueIndex('projection_dirty_date_identity_idx').on(table.userId, table.date)],
)

export const foods = pgTable('foods', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    brand: text('brand'),
    barcode: text('barcode').unique(),
    catalogSource: text('catalog_source'),
    catalogId: text('catalog_id'),
    caloriesPer100g: doublePrecision('calories_per_100g'),
    proteinPer100g: doublePrecision('protein_per_100g'),
    carbsPer100g: doublePrecision('carbs_per_100g'),
    fatPer100g: doublePrecision('fat_per_100g'),
    fiberPer100g: doublePrecision('fiber_per_100g'),
    sugarPer100g: doublePrecision('sugar_per_100g'),
    saturatedFatPer100g: doublePrecision('saturated_fat_per_100g'),
    sodiumPer100g: doublePrecision('sodium_per_100g'),
    potassiumPer100g: doublePrecision('potassium_per_100g'),
    servingName: text('serving_name').notNull().default('serving'),
    servingGrams: doublePrecision('serving_grams').notNull().default(100),
    servingOptions: jsonb('serving_options')
        .$type<Array<{ label: string; grams: number }>>()
        .notNull()
        .default([]),
    favorite: boolean('favorite').notNull().default(false),
    nutritionQuality: text('nutrition_quality').notNull().default('complete'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recipes = pgTable('recipes', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    servings: doublePrecision('servings').notNull().default(1),
    favorite: boolean('favorite').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recipeItems = pgTable('recipe_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id')
        .notNull()
        .references(() => recipes.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id')
        .notNull()
        .references(() => foods.id),
    grams: doublePrecision('grams').notNull(),
})

export const preferences = pgTable('preferences', {
    id: text('id').primaryKey().default('owner'),
    displayName: text('display_name').notNull().default('Owner'),
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('en'),
    units: text('units').notNull().default('metric'),
    metricPreferences: jsonb('metric_preferences'),
    metricResolutionVersion: integer('metric_resolution_version').notNull().default(1),
    goals: jsonb('goals').notNull().default({}),
    mcpEnabled: boolean('mcp_enabled').notNull().default(false),
    mcpAllowedOrigins: jsonb('mcp_allowed_origins').$type<string[]>().notNull().default([]),
    experience: jsonb('experience').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mcpClients = pgTable('mcp_clients', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scopes: jsonb('scopes').notNull().default([]),
    dateFrom: timestamp('date_from', { withTimezone: true }),
    dateTo: timestamp('date_to', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mcpActionReceipts = pgTable(
    'mcp_action_receipts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        clientId: uuid('client_id')
            .notNull()
            .references(() => mcpClients.id, { onDelete: 'cascade' }),
        tool: text('tool').notNull(),
        idempotencyKey: text('idempotency_key').notNull(),
        result: jsonb('result').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('mcp_action_idempotency_idx').on(
            table.clientId,
            table.tool,
            table.idempotencyKey,
        ),
    ],
)

export const mcpConfirmations = pgTable('mcp_confirmations', {
    tokenHash: text('token_hash').primaryKey(),
    clientId: uuid('client_id')
        .notNull()
        .references(() => mcpClients.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    targetId: text('target_id').notNull(),
    payloadHash: text('payload_hash'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pairingCodes = pgTable('pairing_codes', {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const devices = pgTable('devices', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    credentialHash: text('credential_hash').notNull().unique(),
    keyFingerprint: text('key_fingerprint').notNull(),
    publicKey: text('public_key').notNull(),
    status: text('status').notNull().default('pending'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    configuredAt: timestamp('configured_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const deviceRequestNonces = pgTable('device_request_nonces', {
    nonceHash: text('nonce_hash').primaryKey(),
    deviceId: uuid('device_id')
        .notNull()
        .references(() => devices.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const deviceUploadBatches = pgTable(
    'device_upload_batches',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        deviceId: uuid('device_id')
            .notNull()
            .references(() => devices.id, { onDelete: 'cascade' }),
        idempotencyKey: text('idempotency_key').notNull(),
        recordCount: integer('record_count').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('device_upload_idempotency_idx').on(table.deviceId, table.idempotencyKey),
    ],
)

export const syncCursors = pgTable(
    'sync_cursors',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        deviceId: uuid('device_id')
            .notNull()
            .references(() => devices.id, { onDelete: 'cascade' }),
        recordType: text('record_type').notNull(),
        cursor: text('cursor'),
        lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
        status: text('status').notNull().default('idle'),
        diagnostic: text('diagnostic'),
    },
    table => [uniqueIndex('sync_cursor_device_type_idx').on(table.deviceId, table.recordType)],
)

export const goals = pgTable('goals', {
    id: uuid('id').primaryKey().defaultRandom(),
    metricId: text('metric').notNull(),
    legacyTargetValue: doublePrecision('target_value').notNull(),
    aggregation: text('aggregation').notNull().default('latest'),
    comparator: text('comparator').notNull().default('gte'),
    target: jsonb('target').$type<{ value: number } | { min: number; max: number }>().notNull(),
    period: jsonb('period')
        .$type<{ type: 'day' | 'week' } | { type: 'rolling'; days: 7 | 14 | 30 }>()
        .notNull(),
    canonicalUnit: text('canonical_unit').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    schedule: jsonb('schedule').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const savedTrendViews = pgTable('saved_trend_views', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    metric: text('metric').notNull(),
    comparisonMetric: text('comparison_metric'),
    rangeDays: integer('range_days').notNull(),
    granularity: text('granularity').notNull().default('daily'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const owners = pgTable('owners', {
    id: text('id').primaryKey().default('owner'),
    passwordHash: text('password_hash').notNull(),
    recoveryCodeHashes: jsonb('recovery_code_hashes').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const recoveryCodes = pgTable('recovery_codes', {
    codeHash: text('code_hash').primaryKey(),
    ownerId: text('owner_id')
        .notNull()
        .references(() => owners.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable('sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export const auditEvents = pgTable('audit_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const passkeys = pgTable('passkeys', {
    credentialId: text('credential_id').primaryKey(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: jsonb('transports').notNull().default([]),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const authChallenges = pgTable('auth_challenges', {
    attemptId: uuid('attempt_id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    challenge: text('challenge').notNull(),
    browserBindingHash: text('browser_binding_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
