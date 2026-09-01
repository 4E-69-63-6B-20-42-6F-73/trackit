import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import type { DataRepository } from '../data/types.js'
import type { JournalRepository } from '../journal/types.js'

const journal: JournalRepository = {
    list: async () => [],
    ready: async () => true,
}

describe('generated OpenAPI contract', () => {
    it('publishes the observation request schema from the Fastify route', async () => {
        const app = await createApp(journal, {
            dataRepository: {} as DataRepository,
        })
        await app.ready()

        const response = await app.inject({ method: 'GET', url: '/api/openapi.json' })
        const contract = response.json() as {
            paths: Record<
                string,
                {
                    post?: {
                        requestBody?: {
                            content?: Record<string, { schema?: unknown }>
                        }
                    }
                }
            >
        }

        expect(response.statusCode).toBe(200)
        expect(
            contract.paths['/api/observations'].post?.requestBody?.content?.['application/json']
                ?.schema,
        ).toBeDefined()
        await app.close()
    })
})
