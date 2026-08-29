import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { DataLifecycleService } from './data-lifecycle/service.js'
import { PostgresDataRepository } from './data/postgres-repository.js'
import * as schema from './db/schema.js'
import { applyTestMigrations } from './db/test-migrations.js'
import { PostgresJournalRepository } from './journal/postgres-repository.js'

const failInsert = (table: string, action?: string) => `
    CREATE FUNCTION fail_${table}_insert() RETURNS trigger AS $$
    BEGIN
        ${action ? `IF NEW.action = '${action}' THEN RAISE EXCEPTION 'injected failure'; END IF;` : `RAISE EXCEPTION 'injected failure';`}
        RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    CREATE TRIGGER fail_${table}_insert BEFORE INSERT ON ${table}
    FOR EACH ROW EXECUTE FUNCTION fail_${table}_insert();
`

describe('transactional linked writes', () => {
    it('rolls back a meal when its component relation insert fails', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        await client.exec(failInsert('observation_relations'))
        const database = drizzle(client, { schema })
        const app = await createApp(new PostgresJournalRepository(database as never), {
            dataRepository: new PostgresDataRepository(database as never),
            database: database as never,
        })
        const response = await app.inject({
            method: 'POST',
            url: '/api/meals',
            payload: {
                name: 'Rollback meal',
                mealType: 'Lunch',
                eatenAt: '2026-08-21T12:00:00Z',
                nutrients: { calories: 400 },
            },
        })
        expect(response.statusCode).toBe(500)
        expect(await database.select().from(schema.observations)).toHaveLength(0)
        await app.close()
        await client.close()
    })

    it('rolls back retention deletion when its audit insert fails', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        await database.insert(schema.observations).values({
            definitionId: 'meal',
            valueType: 'compound',
            title: 'Retained after failure',
            category: 'Meals',
            observedAt: new Date('2020-01-01T12:00:00Z'),
            attributes: { mealType: 'Lunch', nutrientSnapshot: {} },
        })
        const lifecycle = new DataLifecycleService(database as never)
        await lifecycle.setRetentionRule('meals', 1, true)
        await client.exec(failInsert('audit_events', 'retention.applied'))
        await expect(lifecycle.applyRetention()).rejects.toThrow()
        expect(await database.select().from(schema.observations)).toHaveLength(1)
        await client.close()
    })
})
