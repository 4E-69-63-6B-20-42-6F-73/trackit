import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { JournalRepository } from './types.js'

export function registerJournalDetailRoutes(app: FastifyInstance, repository: JournalRepository) {
    app.get<{ Params: { id: string } }>('/api/journal/:id', async (request, reply) => {
        const id = z.string().uuid().safeParse(request.params.id)
        if (!id.success) return reply.code(400).send({ error: 'invalid_request' })
        const entry = await repository.get?.(id.data)
        return entry ? { data: entry } : reply.code(404).send({ error: 'not_found' })
    })
}
