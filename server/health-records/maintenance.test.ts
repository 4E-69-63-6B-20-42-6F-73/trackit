import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { ProviderRecordMaintenanceService } from './maintenance.js'

describe('ProviderRecordMaintenanceService', () => {
    it('re-derives overlapping live records, filters record types, and removes tombstoned records', async () => {
        const client = new PGlite()
        const migrations = (await readdir('server/db/migrations'))
            .filter(filename => filename.endsWith('.sql'))
            .sort()
        for (const file of migrations) {
            const migration = await readFile(`server/db/migrations/${file}`, 'utf8')
            await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
        }
        const database = drizzle(client, { schema })
        await database
            .insert(schema.preferences)
            .values({ id: 'owner', timezone: 'Europe/Amsterdam' })
            .onConflictDoUpdate({
                target: schema.preferences.id,
                set: { timezone: 'Europe/Amsterdam' },
            })

        const [outside, sleep, tombstone] = await database
            .insert(schema.healthRecords)
            .values([
                {
                    connector: 'health_connect',
                    provider: 'com.example.scale',
                    recordType: 'WeightRecord',
                    externalId: 'outside',
                    externalVersion: 1,
                    startTime: new Date('2026-08-20T08:00:00Z'),
                    payload: { kilograms: 80 },
                },
                {
                    connector: 'health_connect',
                    provider: 'android.health.connect',
                    recordType: 'SleepSessionRecord',
                    externalId: 'spans-into-range',
                    externalVersion: 2,
                    startTime: new Date('2026-08-28T21:00:00Z'),
                    endTime: new Date('2026-08-29T05:00:00Z'),
                    dataOrigin: 'com.example.watch',
                    payload: {},
                },
                {
                    connector: 'health_connect',
                    provider: 'com.example.scale',
                    recordType: 'WeightRecord',
                    externalId: 'deleted-in-range',
                    externalVersion: 3,
                    startTime: new Date('2026-08-29T09:00:00Z'),
                    payload: { kilograms: 79 },
                    deletedAt: new Date('2026-08-29T10:00:00Z'),
                },
            ])
            .returning()

        await database.insert(schema.observations).values({
            definitionId: 'weight',
            canonicalValue: 79,
            canonicalUnit: 'kg',
            originalValue: 79,
            originalUnit: 'kg',
            observedAt: tombstone.startTime,
            sourceRecordId: tombstone.id,
            externalId: `${tombstone.externalId}:weight:v1`,
            derivation: 'weight_projection',
            derivationVersion: 1,
        })

        const maintenance = new ProviderRecordMaintenanceService(database as never)
        const filtered = await maintenance.rederive({
            from: '2026-08-29',
            to: '2026-08-29',
            recordTypes: ['SleepSessionRecord'],
        })

        expect(filtered.sourceRecords).toBe(1)
        expect(filtered.canonicalObservations).toBe(3)
        expect(
            (await database.select().from(schema.observations)).filter(
                observation => observation.sourceRecordId === tombstone.id,
            ),
        ).toHaveLength(1)
        expect(
            (await database.select().from(schema.observations)).filter(
                observation => observation.sourceRecordId === sleep.id,
            ),
        ).toHaveLength(3)

        const result = await maintenance.rederive({
            from: '2026-08-29',
            to: '2026-08-29',
        })

        expect(result.sourceRecords).toBe(2)
        expect(result.canonicalObservations).toBe(3)
        expect(
            (await database.select().from(schema.observations)).filter(
                observation => observation.sourceRecordId === tombstone.id,
            ),
        ).toHaveLength(0)
        expect(
            (await database.select().from(schema.observations)).filter(
                observation => observation.sourceRecordId === sleep.id,
            ),
        ).toHaveLength(3)
        expect(
            (await database.select().from(schema.observations)).filter(
                observation => observation.sourceRecordId === outside.id,
            ),
        ).toHaveLength(0)
        expect(
            (await database.select().from(schema.projectionDirtyDates)).some(
                item => item.date === '2026-08-29',
            ),
        ).toBe(true)

        const [root] = await database
            .select()
            .from(schema.observations)
            .where(eq(schema.observations.id, sleep.id))
        expect(root.attributes).toMatchObject({ sourceLabel: 'Health Connect · com.example.watch' })
        expect(root.metadata).toMatchObject({
            connector: 'Health Connect',
            provider: 'android.health.connect',
            dataOrigin: 'com.example.watch',
        })

        await client.close()
    })
})
