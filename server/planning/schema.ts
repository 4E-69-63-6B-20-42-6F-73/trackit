import {
    bigint,
    doublePrecision,
    index,
    integer,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core'
import { foods, observations, recipes } from '../db/schema.js'
import { foodCategories } from '../nutrition/schema.js'

export const planItems = pgTable(
    'plan_items',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: text('user_id').notNull().default('owner'),
        kind: text('kind').notNull(),
        scheduledDate: text('scheduled_date').notNull(),
        position: integer('position').notNull().default(0),
        skippedAt: timestamp('skipped_at', { withTimezone: true }),
        resultObservationId: uuid('result_observation_id').references(() => observations.id, {
            onDelete: 'set null',
        }),
        version: bigint('version', { mode: 'number' }).notNull().default(1),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp('deleted_at', { withTimezone: true }),
    },
    table => [
        index('plan_item_user_date_idx').on(table.userId, table.scheduledDate),
        uniqueIndex('plan_item_result_observation_idx').on(table.resultObservationId),
    ],
)

export const plannedMeals = pgTable('planned_meals', {
    planItemId: uuid('plan_item_id')
        .primaryKey()
        .references(() => planItems.id, { onDelete: 'cascade' }),
    mealType: text('meal_type').notNull(),
    referenceType: text('reference_type').notNull(),
    foodId: uuid('food_id').references(() => foods.id),
    recipeId: uuid('recipe_id').references(() => recipes.id),
    amount: doublePrecision('amount').notNull(),
    unit: text('unit').notNull(),
})

export const planScheduleTimes = pgTable('plan_schedule_times', {
    planItemId: uuid('plan_item_id')
        .primaryKey()
        .references(() => planItems.id, { onDelete: 'cascade' }),
    scheduledTime: text('scheduled_time').notNull(),
})

export const plannedMealCategories = pgTable('planned_meal_categories', {
    planItemId: uuid('plan_item_id')
        .primaryKey()
        .references(() => planItems.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
        .notNull()
        .references(() => foodCategories.id),
})

export const planFulfillments = pgTable(
    'plan_fulfillments',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        planItemId: uuid('plan_item_id')
            .notNull()
            .references(() => planItems.id, { onDelete: 'cascade' }),
        observationId: uuid('observation_id')
            .notNull()
            .references(() => observations.id, { onDelete: 'cascade' }),
        amount: doublePrecision('amount').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('plan_fulfillment_identity_idx').on(table.planItemId, table.observationId),
        index('plan_fulfillment_plan_idx').on(table.planItemId),
    ],
)
