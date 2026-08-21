import {
    boolean,
    doublePrecision,
    integer,
    bigint,
    index,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core'

export const journalCategory = pgEnum('journal_category', [
    'Meals',
    'Activity',
    'Sleep',
    'Measurements',
    'Check-ins',
])

export const sources = pgTable('sources', {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    externalOrigin: text('external_origin'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const journalEntries = pgTable(
    'journal_entries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        category: journalCategory('category').notNull(),
        title: text('title').notNull(),
        detail: text('detail').notNull().default(''),
        sourceId: uuid('source_id').references(() => sources.id),
        sourceLabel: text('source_label').notNull(),
        observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
        externalId: text('external_id'),
        entityType: text('entity_type'),
        entityId: uuid('entity_id'),
        version: integer('version').notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    table => [
        uniqueIndex('journal_external_source_idx').on(table.sourceId, table.externalId),
        index('journal_observed_at_idx').on(table.observedAt),
        index('journal_category_observed_idx').on(table.category, table.observedAt),
        index('journal_entity_idx').on(table.entityType, table.entityId),
    ],
)

export const observations = pgTable(
    'observations',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        metric: text('metric').notNull(),
        canonicalValue: doublePrecision('canonical_value').notNull(),
        canonicalUnit: text('canonical_unit').notNull(),
        originalValue: doublePrecision('original_value').notNull(),
        originalUnit: text('original_unit').notNull(),
        observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
        endedAt: timestamp('ended_at', { withTimezone: true }),
        sourceId: uuid('source_id').references(() => sources.id),
        externalId: text('external_id'),
        metadata: jsonb('metadata').notNull().default({}),
        excluded: boolean('excluded').notNull().default(false),
        version: bigint('version', { mode: 'number' }).notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    table => [
        uniqueIndex('observation_external_source_idx').on(table.sourceId, table.externalId),
        index('observation_metric_observed_idx').on(table.metric, table.observedAt),
    ],
)

export const meals = pgTable(
    'meals',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull(),
        mealType: text('meal_type').notNull(),
        eatenAt: timestamp('eaten_at', { withTimezone: true }).notNull(),
        nutrientSnapshot: jsonb('nutrient_snapshot').notNull().default({}),
        nutritionQuality: text('nutrition_quality').notNull().default('complete'),
        favorite: boolean('favorite').notNull().default(false),
        sourceId: uuid('source_id').references(() => sources.id),
        version: integer('version').notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    table => [index('meal_eaten_at_idx').on(table.eatenAt)],
)

export const foods = pgTable('foods', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    brand: text('brand'),
    caloriesPer100g: doublePrecision('calories_per_100g').notNull().default(0),
    proteinPer100g: doublePrecision('protein_per_100g').notNull().default(0),
    carbsPer100g: doublePrecision('carbs_per_100g').notNull().default(0),
    fatPer100g: doublePrecision('fat_per_100g').notNull().default(0),
    fiberPer100g: doublePrecision('fiber_per_100g').notNull().default(0),
    sugarPer100g: doublePrecision('sugar_per_100g').notNull().default(0),
    saturatedFatPer100g: doublePrecision('saturated_fat_per_100g').notNull().default(0),
    sodiumPer100g: doublePrecision('sodium_per_100g').notNull().default(0),
    potassiumPer100g: doublePrecision('potassium_per_100g').notNull().default(0),
    servingName: text('serving_name').notNull().default('serving'),
    servingGrams: doublePrecision('serving_grams').notNull().default(100),
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

export const mealItems = pgTable('meal_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    mealId: uuid('meal_id')
        .notNull()
        .references(() => meals.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id').references(() => foods.id),
    nameSnapshot: text('name_snapshot').notNull(),
    grams: doublePrecision('grams').notNull(),
    nutrientSnapshot: jsonb('nutrient_snapshot').notNull(),
})

export const preferences = pgTable('preferences', {
    id: text('id').primaryKey().default('owner'),
    displayName: text('display_name').notNull().default('Owner'),
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('en'),
    units: text('units').notNull().default('metric'),
    goals: jsonb('goals').notNull().default({}),
    mcpEnabled: boolean('mcp_enabled').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mcpClients = pgTable('mcp_clients', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    scopes: jsonb('scopes').notNull().default([]),
    dateFrom: timestamp('date_from', { withTimezone: true }),
    dateTo: timestamp('date_to', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
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

export const backupRuns = pgTable('backup_runs', {
    id: uuid('id').primaryKey().defaultRandom(),
    filename: text('filename').notNull(),
    status: text('status').notNull(),
    encrypted: boolean('encrypted').notNull().default(true),
    sizeBytes: integer('size_bytes'),
    diagnostic: text('diagnostic'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
})

export const retentionRules = pgTable('retention_rules', {
    category: text('category').primaryKey(),
    days: integer('days').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const goals = pgTable('goals', {
    id: uuid('id').primaryKey().defaultRandom(),
    metric: text('metric').notNull(),
    targetValue: doublePrecision('target_value').notNull(),
    canonicalUnit: text('canonical_unit').notNull(),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    schedule: jsonb('schedule').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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
