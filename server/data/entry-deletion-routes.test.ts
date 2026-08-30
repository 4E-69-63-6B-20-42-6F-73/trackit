import { readFile, readdir } from 'node:fs/promises'
import Fastify from 'fastify'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { observationRelations, observations } from '../db/schema.js'
import { registerEntryDeletionRoutes } from './entry-deletion-routes.js'
import { PostgresDataRepository } from './postgres-repository.js'

async function migratedDatabase() {
    const client = new PGlite()
    for (const filename of (await readdir('server/db/migrations'))
        .filter(name => name.endsWith('.sql'))
        .sort()) {
        const migration = await readFile(`server/db/migrations/${filename}`, 'utf8')
        await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
    return { client, database: drizzle(client, { schema }) }
}

describe('entry deletion routes', () => {
    it('deletes compound meals through the meal path and leaves no active nutrient components', async () => {
        const { client, database } = await migratedDatabase()
        const repository = new PostgresDataRepository(database as never)
        const meal = (await repository.createMeal({
            name: 'Pizza',
            mealType: 'Dinner',
            eatenAt: '2026-08-29T18:00:00.000Z',
            nutrients: { calories: 420, protein: 18 },
            favorite: false,
            nutritionQuality: 'estimated',
            serving: { amount: 200, unit: 'g' },
        }))!
        const components = await database
            .select({ id: observationRelations.childObservationId })
            .from(observationRelations)
            .where(eq(observationRelations.parentObservationId, meal.id))
        const app = Fastify()
        registerEntryDeletionRoutes(app, database as never, repository)

        const response = await app.inject({
            method: 'DELETE',
            url: `/api/observations/${meal.id}`,
        })

        expect(response.statusCode).toBe(204)
        expect(await repository.listMeals()).toEqual([])
        const active = await database
            .select({ id: observations.id })
            .from(observations)
            .where(
                and(
                    inArray(observations.id, [meal.id, ...components.map(item => item.id)]),
                    isNull(observations.deletedAt),
                ),
            )
        expect(active).toEqual([])
        await app.close()
        await client.close()
    })

    it('refuses a non-meal through the meal route and deletes it through the observation route', async () => {
        const { client, database } = await migratedDatabase()
        const repository = new PostgresDataRepository(database as never)
        const observation = (await repository.createObservation({
            definitionId: 'weight',
            valueType: 'number',
            value: 80,
            unit: 'kg',
            observedAt: '2026-08-29T08:00:00.000Z',
            source: 'You',
            attributes: {},
        })) as { id: string }
        const app = Fastify()
        registerEntryDeletionRoutes(app, database as never, repository)

        expect(
            (
                await app.inject({
                    method: 'DELETE',
                    url: `/api/meals/${observation.id}`,
                })
            ).statusCode,
        ).toBe(404)
        expect(
            (
                await database
                    .select({ id: observations.id })
                    .from(observations)
                    .where(and(eq(observations.id, observation.id), isNull(observations.deletedAt)))
            ).length,
        ).toBe(1)

        expect(
            (
                await app.inject({
                    method: 'DELETE',
                    url: `/api/observations/${observation.id}`,
                })
            ).statusCode,
        ).toBe(204)
        expect(
            (
                await database
                    .select({ id: observations.id })
                    .from(observations)
                    .where(and(eq(observations.id, observation.id), isNull(observations.deletedAt)))
            ).length,
        ).toBe(0)
        await app.close()
        await client.close()
    })
})
