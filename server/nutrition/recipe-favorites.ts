import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type * as schemaType from '../db/schema.js'
import { recipes } from '../db/schema.js'

type Database = PostgresJsDatabase<typeof schemaType>

const favoriteSchema = z.object({
    favorite: z.boolean(),
    version: z.number().int().positive(),
})

export function registerRecipeFavoriteRoutes(app: FastifyInstance, database: Database) {
    app.patch<{ Params: { id: string } }>('/api/recipes/:id/favorite', async (request, reply) => {
        const parsed = favoriteSchema.safeParse(request.body)
        if (!parsed.success) return reply.code(400).send({ error: 'invalid_recipe_favorite' })
        const input = parsed.data
        const [updated] = await database
            .update(recipes)
            .set({
                favorite: input.favorite,
                version: input.version + 1,
                updatedAt: new Date(),
            })
            .where(
                and(eq(recipes.id, request.params.id), eq(recipes.version, input.version)),
            )
            .returning()
        if (!updated) return reply.code(409).send({ error: 'version_conflict' })
        return { data: updated }
    })
}
