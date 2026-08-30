import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'
import { foods, recipeItems, recipes } from '../db/schema.js'
import type * as schemaType from '../db/schema.js'

type Database = PostgresJsDatabase<typeof schemaType>

type FoodDeleteResult =
    | { status: 'deleted' }
    | { status: 'in_use'; recipes: Array<{ id: string; name: string }> }
    | { status: 'version_conflict' }
    | { status: 'not_found' }

export class FoodLibraryService {
    constructor(private readonly database: Database) {}

    async deleteFood(id: string, version: number): Promise<FoodDeleteResult> {
        return this.database.transaction(async transaction => {
            const usedBy = await transaction
                .select({ id: recipes.id, name: recipes.name })
                .from(recipeItems)
                .innerJoin(recipes, eq(recipeItems.recipeId, recipes.id))
                .where(eq(recipeItems.foodId, id))

            if (usedBy.length) return { status: 'in_use', recipes: usedBy }

            const [deleted] = await transaction
                .delete(foods)
                .where(and(eq(foods.id, id), eq(foods.version, version)))
                .returning({ id: foods.id })

            if (deleted) return { status: 'deleted' }

            const [existing] = await transaction
                .select({ id: foods.id })
                .from(foods)
                .where(eq(foods.id, id))
                .limit(1)

            return existing ? { status: 'version_conflict' } : { status: 'not_found' }
        })
    }
}

const deleteFoodSchema = z.object({ version: z.number().int().positive() })

export function registerFoodLibraryRoutes(app: FastifyInstance, database: Database) {
    const library = new FoodLibraryService(database)

    app.delete<{ Params: { id: string } }>('/api/foods/:id', async (request, reply) => {
        const input = deleteFoodSchema.safeParse(request.body)
        if (!input.success) return reply.code(400).send({ error: 'invalid_food_delete' })

        const result = await library.deleteFood(request.params.id, input.data.version)
        if (result.status === 'deleted') return reply.code(204).send()
        if (result.status === 'in_use') {
            return reply.code(409).send({ error: 'food_in_use', recipes: result.recipes })
        }
        if (result.status === 'version_conflict') {
            return reply.code(409).send({ error: 'version_conflict' })
        }
        return reply.code(404).send({ error: 'not_found' })
    })
}
