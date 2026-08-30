import { eq, inArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type * as schemaType from '../db/schema.js'
import { foods } from '../db/schema.js'
import { defaultFoodCategories, foodCategories, foodCategoryMemberships } from './schema.js'

type Database = PostgresJsDatabase<typeof schemaType>

const categoryIdSchema = z.string().regex(/^[a-z0-9-]{1,60}$/)
const membershipSchema = z.object({ categoryIds: z.array(categoryIdSchema).max(20) })

export function registerFoodCategoryRoutes(app: FastifyInstance, database: Database) {
    app.get('/api/food-categories', async () => {
        await database.insert(foodCategories).values(defaultFoodCategories).onConflictDoNothing()
        const [categories, memberships] = await Promise.all([
            database
                .select()
                .from(foodCategories)
                .orderBy(foodCategories.sortOrder, foodCategories.name),
            database.select().from(foodCategoryMemberships),
        ])
        return {
            data: categories.map(category => ({
                id: category.id,
                name: category.name,
                foodIds: memberships
                    .filter(membership => membership.categoryId === category.id)
                    .map(membership => membership.foodId),
            })),
        }
    })

    app.put<{ Params: { id: string } }>('/api/foods/:id/categories', async (request, reply) => {
        const parsed = membershipSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_food_categories' })
        const categoryIds = [...new Set(parsed.data.categoryIds)]
        const [food] = await database
            .select({ id: foods.id })
            .from(foods)
            .where(eq(foods.id, request.params.id))
            .limit(1)
        if (!food) return reply.code(404).send({ error: 'food_not_found' })

        await database.insert(foodCategories).values(defaultFoodCategories).onConflictDoNothing()
        if (categoryIds.length) {
            const existing = await database
                .select({ id: foodCategories.id })
                .from(foodCategories)
                .where(inArray(foodCategories.id, categoryIds))
            if (existing.length !== categoryIds.length)
                return reply.code(400).send({ error: 'unknown_food_category' })
        }

        await database.transaction(async transaction => {
            await transaction
                .delete(foodCategoryMemberships)
                .where(eq(foodCategoryMemberships.foodId, request.params.id))
            if (categoryIds.length)
                await transaction.insert(foodCategoryMemberships).values(
                    categoryIds.map(categoryId => ({
                        foodId: request.params.id,
                        categoryId,
                    })),
                )
        })
        return { data: { categoryIds } }
    })
}
