import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { foods } from '../db/schema.js'

export const foodCategories = pgTable('food_categories', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const foodCategoryMemberships = pgTable(
    'food_category_memberships',
    {
        foodId: uuid('food_id')
            .notNull()
            .references(() => foods.id, { onDelete: 'cascade' }),
        categoryId: text('category_id')
            .notNull()
            .references(() => foodCategories.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    table => [
        uniqueIndex('food_category_membership_identity_idx').on(table.foodId, table.categoryId),
        index('food_category_membership_category_idx').on(table.categoryId),
    ],
)

export const defaultFoodCategories = [
    { id: 'fruit', name: 'Fruit', sortOrder: 10 },
    { id: 'vegetable', name: 'Vegetables', sortOrder: 20 },
    { id: 'legume', name: 'Legumes', sortOrder: 30 },
    { id: 'whole-grain', name: 'Whole grains', sortOrder: 40 },
    { id: 'nuts-seeds', name: 'Nuts & seeds', sortOrder: 50 },
    { id: 'dairy', name: 'Dairy', sortOrder: 60 },
    { id: 'egg', name: 'Eggs', sortOrder: 70 },
    { id: 'meat', name: 'Meat', sortOrder: 80 },
    { id: 'fish-seafood', name: 'Fish & seafood', sortOrder: 90 },
    { id: 'other', name: 'Other', sortOrder: 100 },
] as const
