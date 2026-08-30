import { and, eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { FastifyInstance } from 'fastify'
import type * as schemaType from '../db/schema.js'
import { observations } from '../db/schema.js'
import type { DataRepository } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

async function entryType(database: Database, id: string) {
    const [record] = await database
        .select({
            definitionId: observations.definitionId,
            valueType: observations.valueType,
        })
        .from(observations)
        .where(and(eq(observations.id, id), isNull(observations.deletedAt)))
        .limit(1)

    if (!record) return null
    return record.definitionId === 'meal' && record.valueType === 'compound'
        ? ('meal' as const)
        : ('observation' as const)
}

export function registerEntryDeletionRoutes(
    app: FastifyInstance,
    database: Database,
    data: Pick<DataRepository, 'removeObservation' | 'removeMeal'>,
) {
    app.delete<{ Params: { id: string } }>('/api/observations/:id', async (request, reply) => {
        const type = await entryType(database, request.params.id)
        if (!type) return reply.code(404).send({ error: 'not_found' })
        const removed =
            type === 'meal'
                ? await data.removeMeal(request.params.id)
                : await data.removeObservation(request.params.id)
        return removed
            ? reply.code(204).send()
            : reply.code(404).send({ error: 'not_found' })
    })

    app.delete<{ Params: { id: string } }>('/api/meals/:id', async (request, reply) => {
        if ((await entryType(database, request.params.id)) !== 'meal')
            return reply.code(404).send({ error: 'not_found' })
        return (await data.removeMeal(request.params.id))
            ? reply.code(204).send()
            : reply.code(404).send({ error: 'not_found' })
    })
}
