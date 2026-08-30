import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { registerRecipeFavoriteRoutes } from './recipe-favorites.js'

describe('recipe favorite routes', () => {
    it('updates favorite state with optimistic versioning', async () => {
        const databaseClient = new PGlite()
        await applyTestMigrations(databaseClient)
        const database = drizzle(databaseClient, { schema })
        const app = Fastify()
        registerRecipeFavoriteRoutes(app, database as never)

        const [recipe] = await database
            .insert(schema.recipes)
            .values({ name: 'Breakfast bowl', servings: 2, favorite: false })
            .returning()

        const response = await app.inject({
            method: 'PATCH',
            url: `/api/recipes/${recipe.id}/favorite`,
            payload: { favorite: true, version: recipe.version },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json().data).toMatchObject({
            id: recipe.id,
            favorite: true,
            version: Number(recipe.version) + 1,
        })

        const conflict = await app.inject({
            method: 'PATCH',
            url: `/api/recipes/${recipe.id}/favorite`,
            payload: { favorite: false, version: recipe.version },
        })
        expect(conflict.statusCode).toBe(409)

        await app.close()
        await databaseClient.close()
    })
})
