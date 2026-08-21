import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { applyTestMigrations, migrationFiles } from './test-migrations.js'

describe('database migration', () => {
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
})
