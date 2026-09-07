import { readFile, readdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { DeviceService } from './service.js'

describe('chunked health record reconciliation', () => {
    it('accumulates IDs and deletes missing records only on completion', async () => {
        const client = new PGlite()
        const migrations = (await readdir('server/db/migrations'))
            .filter(filename => filename.endsWith('.sql'))
            .sort()
        for (const file of migrations) {
            const migration = await readFile(`server/db/migrations/${file}`, 'utf8')
            await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
        }
        const database = drizzle(client, { schema })
        const service = new DeviceService(database as never, 'https://trackit.test')
        const deviceId = randomUUID()
        await database.insert(schema.devices).values({
            id: deviceId,
            name: 'Pixel',
            credentialHash: randomUUID(),
            keyFingerprint: 'fingerprint',
            publicKey: 'public-key',
            status: 'confirmed',
        })

        const keptId = 'heart-rate-kept'
        const staleId = 'heart-rate-stale'
        const record = (externalId: string) => ({
            provider: 'health_connect',
            recordType: 'HeartRateRecord',
            externalId,
            externalVersion: 1,
            startTime: '2026-08-23T08:00:00Z',
            endTime: '2026-08-23T08:01:00Z',
            dataOrigin: 'com.example.watch',
            payload: { samples: [{ time: '2026-08-23T08:00:00Z', bpm: 70 }] },
        })
        await service.uploadHealthRecords(deviceId, randomUUID(), [record(keptId), record(staleId)])

        const { reconcileId } = await service.startHealthRecordReconcile(
            deviceId,
            'HeartRateRecord',
            '2026-08-01T00:00:00Z',
        )
        await service.appendHealthRecordReconcile(deviceId, reconcileId, [keptId])
        await service.appendHealthRecordReconcile(deviceId, reconcileId, [keptId])

        const beforeComplete = await database
            .select()
            .from(schema.healthRecords)
            .where(eq(schema.healthRecords.externalId, staleId))
        expect(beforeComplete[0]?.deletedAt).toBeNull()
        expect(
            await database
                .select()
                .from(schema.deviceReconcileIds)
                .where(eq(schema.deviceReconcileIds.sessionId, reconcileId)),
        ).toHaveLength(1)

        await expect(
            service.completeHealthRecordReconcile(deviceId, reconcileId),
        ).resolves.toMatchObject({
            reconciled: 1,
        })

        const kept = await database
            .select()
            .from(schema.healthRecords)
            .where(eq(schema.healthRecords.externalId, keptId))
        const stale = await database
            .select()
            .from(schema.healthRecords)
            .where(eq(schema.healthRecords.externalId, staleId))
        expect(kept[0]?.deletedAt).toBeNull()
        expect(stale[0]?.deletedAt).toBeInstanceOf(Date)
        expect(
            await database
                .select()
                .from(schema.deviceReconcileSessions)
                .where(eq(schema.deviceReconcileSessions.id, reconcileId)),
        ).toHaveLength(0)
        expect(
            await database
                .select()
                .from(schema.deviceReconcileIds)
                .where(eq(schema.deviceReconcileIds.sessionId, reconcileId)),
        ).toHaveLength(0)

        await client.close()
    })
})
