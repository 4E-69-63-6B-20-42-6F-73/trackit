import { afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as schema from './db/schema.js'
import { PostgresDataRepository } from './data/postgres-repository.js'

const enabled = process.env.TRACKIT_POSTGRES_INTEGRATION === 'true'
const client = enabled ? postgres(process.env.DATABASE_URL ?? '') : null
const database = client ? drizzle(client, { schema }) : null

describe.runIf(enabled)('PostgreSQL integration', () => {
    afterAll(async () => client?.end())

    it('migrates and round-trips observation provenance on PostgreSQL', async () => {
        if (!database) throw new Error('PostgreSQL integration database missing')
        await migrate(database, { migrationsFolder: './server/db/migrations' })
        const repository = new PostgresDataRepository(database)
        const created = (await repository.createObservation({
            metric: 'weight',
            value: 72.5,
            unit: 'kg',
            observedAt: '2026-08-20T08:30:00.000Z',
            source: 'Integration test',
        })) as { id: string; originalUnit: string; observedAt: Date }
        try {
            const records = (await repository.listObservations({
                from: '2026-08-20T00:00:00.000Z',
                to: '2026-08-21T00:00:00.000Z',
            })) as { id: string; originalUnit: string; observedAt: Date }[]
            expect(records).toContainEqual(
                expect.objectContaining({
                    id: created.id,
                    originalUnit: 'kg',
                    observedAt: new Date('2026-08-20T08:30:00.000Z'),
                }),
            )
        } finally {
            await database.delete(schema.observations).where(eq(schema.observations.id, created.id))
        }
    })
})
