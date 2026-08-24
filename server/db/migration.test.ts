import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { applyTestMigrations, migrationFiles } from './test-migrations.js'

describe('database migration', () => {
    it('migrates legacy goals once while preserving their meaning and schedule', async () => {
        const database = new PGlite()
        const files = await migrationFiles()
        await applyTestMigrations(
            database,
            files.filter(file => file < '0007_generalized_goals.sql'),
        )
        await database.exec(`
            insert into goals (
                id, metric, target_value, canonical_unit, effective_from, effective_to, schedule
            ) values (
                '00000000-0000-4000-8000-000000000099',
                'steps', 10000, 'count',
                '2026-09-01T00:00:00Z', '2026-12-31T23:59:59Z',
                '{"weekdays":[1,2,3,4,5]}'::jsonb
            );
        `)
        await applyTestMigrations(database, ['0007_generalized_goals.sql'])

        const result = await database.query<{
            id: string
            metric: string
            target_value: number
            aggregation: string
            comparator: string
            target: { value: number }
            period: { type: string }
            effective_from: Date
            effective_to: Date
            schedule: { weekdays: number[] }
        }>(`select * from goals where id = '00000000-0000-4000-8000-000000000099'`)

        expect(result.rows[0]).toMatchObject({
            id: '00000000-0000-4000-8000-000000000099',
            metric: 'steps',
            target_value: 10000,
            aggregation: 'total',
            comparator: 'gte',
            target: { value: 10000 },
            period: { type: 'day' },
            schedule: { weekdays: [1, 2, 3, 4, 5] },
        })
        expect(result.rows[0].effective_from.toISOString()).toBe('2026-09-01T00:00:00.000Z')
        expect(result.rows[0].effective_to.toISOString()).toBe('2026-12-31T23:59:59.000Z')
        await database.close()
    })

    it('creates the persistent health record tables in PostgreSQL', async () => {
        const database = new PGlite()
        await applyTestMigrations(database)
        const result = await database.query<{ table_name: string }>(
            `select table_name from information_schema.tables
             where table_schema = 'public' order by table_name`,
        )
        expect(result.rows.map(row => row.table_name)).toEqual(
            expect.arrayContaining([
                'journal_entries',
                'meals',
                'observations',
                'owners',
                'passkeys',
                'preferences',
                'sessions',
                'sources',
                'audit_events',
                'auth_challenges',
                'foods',
                'recipes',
                'recipe_items',
                'meal_items',
                'goals',
                'saved_trend_views',
                'mcp_clients',
                'devices',
                'pairing_codes',
                'device_upload_batches',
                'sync_cursors',
                'backup_runs',
                'retention_rules',
                'mcp_action_receipts',
                'mcp_confirmations',
                'recovery_codes',
                'device_request_nonces',
            ]),
        )
        await database.close()
    })

    it('upgrades the previous schema without losing records or historical defaults', async () => {
        const database = new PGlite()
        const files = await migrationFiles()
        await applyTestMigrations(
            database,
            files.filter(file => file < '0014_'),
        )
        await database.exec(`
            insert into foods (id, name, calories_per_100g)
            values ('00000000-0000-4000-8000-000000000001', 'Upgrade oats', 389);
            insert into meals (id, name, meal_type, eaten_at, nutrient_snapshot)
            values (
                '00000000-0000-4000-8000-000000000002',
                'Upgrade breakfast',
                'Breakfast',
                now(),
                '{"calories":389}'::jsonb
            );
            insert into recipes (id, name, servings)
            values ('00000000-0000-4000-8000-000000000003', 'Upgrade porridge', 2);
            insert into saved_trend_views (id, name, metric, range_days)
            values ('00000000-0000-4000-8000-000000000004', 'Upgrade view', 'weight', 30);
        `)
        await applyTestMigrations(
            database,
            files.filter(file => file >= '0014_'),
        )
        await database.exec(`
            insert into observations (
                metric, canonical_value, canonical_unit, original_value, original_unit,
                observed_at, version
            ) values ('steps', 1, 'count', 1, 'count', now(), 1787238227225);
        `)
        const sourceVersions = await database.query<{ version: string }>(
            `select version::text as version from observations where version = 1787238227225`,
        )
        expect(sourceVersions.rows).toEqual([{ version: '1787238227225' }])
        const result = await database.query<{ name: string; nutrition_quality: string }>(
            `select name, nutrition_quality from foods where name = 'Upgrade oats'
             union all
             select name, nutrition_quality from meals where name = 'Upgrade breakfast'`,
        )
        expect(result.rows).toEqual([
            { name: 'Upgrade oats', nutrition_quality: 'complete' },
            { name: 'Upgrade breakfast', nutrition_quality: 'complete' },
        ])
        const recipes = await database.query<{ name: string; version: number }>(
            `select name, version from recipes where name = 'Upgrade porridge'`,
        )
        expect(recipes.rows).toEqual([{ name: 'Upgrade porridge', version: 1 }])
        const foods = await database.query<{
            name: string
            version: number
            last_used_at: Date | null
        }>(`select name, version, last_used_at from foods where name = 'Upgrade oats'`)
        expect(foods.rows).toEqual([{ name: 'Upgrade oats', version: 1, last_used_at: null }])
        const views = await database.query<{ name: string; granularity: string }>(
            `select name, granularity from saved_trend_views where name = 'Upgrade view'`,
        )
        expect(views.rows).toEqual([{ name: 'Upgrade view', granularity: 'daily' }])
        await database.close()
    })

    it('removes passive Health Connect projections without deleting source health data', async () => {
        const database = new PGlite()
        const files = await migrationFiles()
        await applyTestMigrations(
            database,
            files.filter(file => file <= '0003_health_connect_records.sql'),
        )
        await database.exec(`
            insert into health_records (id, provider, record_type, external_id, start_time, payload)
            values
                ('00000000-0000-4000-8000-000000000010', 'health_connect', 'StepsRecord', 'steps', now(), '{}'),
                ('00000000-0000-4000-8000-000000000011', 'health_connect', 'SleepSessionRecord', 'sleep', now(), '{}');
            insert into journal_entries (
                id, category, title, source_label, observed_at, entity_type, entity_id
            ) values
                ('00000000-0000-4000-8000-000000000010', 'Activity', 'Steps', 'Health Connect', now(), 'health_record', '00000000-0000-4000-8000-000000000010'),
                ('00000000-0000-4000-8000-000000000011', 'Sleep', 'Sleep session', 'Health Connect', now(), 'health_record', '00000000-0000-4000-8000-000000000011');
            insert into observations (
                metric, canonical_value, canonical_unit, original_value, original_unit,
                observed_at, source_record_id
            ) values ('steps', 12, 'count', 12, 'count', now(), '00000000-0000-4000-8000-000000000010');
        `)
        await applyTestMigrations(database, ['0004_quiet_health_journal.sql'])

        const journal = await database.query<{ title: string; deleted: boolean }>(`
            select title, deleted_at is not null as deleted
            from journal_entries order by title
        `)
        expect(journal.rows).toEqual([
            { title: 'Sleep session', deleted: false },
            { title: 'Steps', deleted: true },
        ])
        expect((await database.query(`select id from health_records`)).rows).toHaveLength(2)
        expect((await database.query(`select id from observations`)).rows).toHaveLength(1)
        await database.close()
    })
})
