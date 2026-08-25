import { readFile, readdir } from 'node:fs/promises'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { DeviceService } from './service.js'
import { ProjectionWorker } from '../data/projection-state.js'

describe('Android device pairing and upload', () => {
    it('requires confirmation, consumes pairing codes, deduplicates batches, and revokes immediately', async () => {
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
        const keyPair = generateKeyPairSync('ec', {
            namedCurve: 'P-256',
            publicKeyEncoding: { format: 'der', type: 'spki' },
            privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
        })
        const publicKey = keyPair.publicKey.toString('base64')
        const fingerprint = createHash('sha256').update(keyPair.publicKey).digest('base64url')
        const authenticationRequest = (
            credential?: string,
            overrides: Record<string, string> = {},
        ) => {
            const timestamp = overrides.timestamp ?? Date.now().toString()
            const request = {
                credential,
                deviceId: overrides.deviceId ?? randomUUID(),
                method: overrides.method ?? 'POST',
                path: overrides.path ?? '/api/device/upload',
                timestamp,
                nonce: overrides.nonce ?? randomUUID(),
                bodyHash: overrides.bodyHash ?? createHash('sha256').update('{}').digest('hex'),
            }
            const canonical = [
                request.method,
                request.path,
                timestamp,
                request.nonce,
                request.bodyHash,
                request.deviceId,
            ].join('\n')
            const signature = sign('sha256', Buffer.from(canonical), keyPair.privateKey).toString(
                'base64url',
            )
            return {
                ...request,
                path: overrides.submittedPath ?? request.path,
                bodyHash: overrides.submittedBodyHash ?? request.bodyHash,
                signature,
            }
        }
        const authenticate = (credential?: string, overrides: Record<string, string> = {}) =>
            service.authenticate(authenticationRequest(credential, overrides))
        const authenticateDetailed = (
            credential?: string,
            overrides: Record<string, string> = {},
        ) => service.authenticateDetailed(authenticationRequest(credential, overrides))
        const pairing = await service.createPairingCode()
        const result = await service.requestPairing(
            pairing.code,
            'Pixel',
            fingerprint,
            publicKey,
            pairing.serverIdentity,
        )
        expect(result).not.toBeNull()
        const requested = result as {
            deviceId: string
            credential: string
            status: string
            serverIdentity: string
        }
        expect(requested.status).toBe('pending')
        // Second request should fail because code was already consumed by first request
        await new Promise(r => setTimeout(r, 10))
        expect(
            await service.requestPairing(
                pairing.code,
                'Other',
                fingerprint,
                publicKey,
                pairing.serverIdentity,
            ),
        ).toEqual({
            error: 'expired',
            error_details: {
                message: 'Pairing code has expired. Please generate a new code.',
                error: 'expired',
            },
        })
        expect(
            await authenticate(requested?.credential, {
                deviceId: requested?.deviceId,
                nonce: randomUUID(),
            }),
        ).toBeNull()

        await service.confirm(requested!.deviceId)
        expect(
            await authenticate(requested?.credential, {
                deviceId: requested?.deviceId,
                nonce: randomUUID(),
            }),
        ).not.toBeNull()
        expect(
            await authenticate(requested?.credential, {
                deviceId: requested?.deviceId,
                timestamp: String(Date.now() - 120_000),
            }),
        ).toBeNull()
        await expect(
            authenticateDetailed(requested?.credential, {
                deviceId: requested?.deviceId,
                timestamp: String(Date.now() - 120_000),
            }),
        ).resolves.toMatchObject({ error: 'clock_skew' })
        const replayNonce = randomUUID()
        expect(
            await authenticate(requested?.credential, {
                deviceId: requested?.deviceId,
                nonce: replayNonce,
            }),
        ).not.toBeNull()
        expect(
            await authenticate(requested?.credential, {
                deviceId: requested?.deviceId,
                nonce: replayNonce,
            }),
        ).toBeNull()
        await expect(
            authenticateDetailed(requested?.credential, {
                deviceId: requested?.deviceId,
                nonce: replayNonce,
            }),
        ).resolves.toMatchObject({ error: 'nonce_replay' })
        const validBodyHash = createHash('sha256').update('{}').digest('hex')
        expect(
            await authenticate(requested?.credential, {
                deviceId: requested?.deviceId,
                bodyHash: validBodyHash,
                path: '/api/device/cursor',
            }),
        ).not.toBeNull()
        expect(
            await authenticate(requested?.credential, {
                deviceId: requested?.deviceId,
                path: '/api/device/upload',
                submittedPath: '/api/device/cursor',
            }),
        ).toBeNull()
        await expect(
            authenticateDetailed(requested?.credential, {
                deviceId: requested?.deviceId,
                path: '/api/device/upload',
                submittedPath: '/api/device/cursor',
            }),
        ).resolves.toMatchObject({ error: 'signature_mismatch' })
        expect(
            await authenticate(requested?.credential, {
                submittedBodyHash: createHash('sha256').update('{"tampered":true}').digest('hex'),
            }),
        ).toBeNull()
        const batch = randomUUID()
        const records = [
            {
                externalId: 'health-connect-record',
                metric: 'steps',
                value: 3210,
                unit: 'count',
                observedAt: '2026-08-20T08:00:00Z',
                version: 1,
                dataOrigin: 'com.example.watch',
            },
        ]
        expect(await service.upload(requested!.deviceId, batch, records)).toEqual({
            duplicate: false,
            accepted: 1,
        })
        expect(await service.upload(requested!.deviceId, batch, records)).toEqual({
            duplicate: true,
            accepted: 1,
        })
        await service.upload(requested!.deviceId, randomUUID(), [
            { ...records[0], value: 1, version: 0 },
        ])
        const [stored] = await database.select().from(schema.observations)
        expect(stored).toMatchObject({
            canonicalValue: 3210,
            originalUnit: 'count',
            metadata: { source: 'Health Connect', dataOrigin: 'com.example.watch' },
        })
        // Verify configuredAt is set when device is confirmed
        const [confirmedDevice] = await database
            .select()
            .from(schema.devices)
            .where(eq(schema.devices.id, requested?.deviceId))
        expect(confirmedDevice?.configuredAt).toBeInstanceOf(Date)
        await service.upload(requested!.deviceId, randomUUID(), [
            { ...records[0], deleted: true, version: 0 },
        ])
        const [afterNewDelete] = await database.select().from(schema.observations)
        expect(afterNewDelete.deletedAt).toBeInstanceOf(Date)
        expect(afterNewDelete.version).toBe(Number.MAX_SAFE_INTEGER)
        await service.upload(requested!.deviceId, randomUUID(), [
            { ...records[0], value: 9999, version: 2 },
        ])
        const [afterEqualReplay] = await database.select().from(schema.observations)
        expect(afterEqualReplay.deletedAt).toBeInstanceOf(Date)
        expect(afterEqualReplay.canonicalValue).toBe(3210)
        await service.upload(requested!.deviceId, randomUUID(), [
            {
                ...records[0],
                externalId: 'deleted-before-import',
                value: 0,
                unit: 'deleted',
                deleted: true,
                version: 0,
            },
        ])
        await service.upload(requested!.deviceId, randomUUID(), [
            { ...records[0], externalId: 'deleted-before-import', version: 5 },
        ])
        const deletedBeforeImport = (await database.select().from(schema.observations)).find(
            observation => observation.externalId?.endsWith(':deleted-before-import'),
        )
        expect(deletedBeforeImport).toMatchObject({
            canonicalValue: 0,
            version: Number.MAX_SAFE_INTEGER,
        })
        expect(deletedBeforeImport?.deletedAt).toBeInstanceOf(Date)

        const sourceId = 'canonical-heart-rate'
        const canonical = {
            provider: 'health_connect',
            recordType: 'HeartRateRecord',
            externalId: sourceId,
            externalVersion: 100,
            startTime: '2026-08-23T08:00:00Z',
            endTime: '2026-08-23T08:02:00Z',
            dataOrigin: 'com.example.watch',
            recordingMethod: 'automatic',
            device: { type: 'watch', manufacturer: 'Example', model: 'One' },
            payload: {
                samples: [
                    { time: '2026-08-23T08:00:00Z', bpm: 60 },
                    { time: '2026-08-23T08:01:00Z', bpm: 80 },
                ],
            },
            lastModifiedTime: '2026-08-23T08:03:00Z',
        }
        await service.uploadHealthRecords(requested!.deviceId, randomUUID(), [canonical])
        const [source] = await database
            .select()
            .from(schema.healthRecords)
            .where(eq(schema.healthRecords.externalId, sourceId))
        expect(source).toMatchObject({
            recordType: 'HeartRateRecord',
            dataOrigin: 'com.example.watch',
            payload: canonical.payload,
            device: canonical.device,
        })
        let projections = (await database.select().from(schema.observations)).filter(
            observation => observation.sourceRecordId === source.id,
        )
        expect(projections).toHaveLength(6)
        expect(projections.find(item => item.metric === 'heart_rate')).toMatchObject({
            canonicalValue: 70,
            derivation: 'heart_rate_summary',
            derivationVersion: 1,
        })
        await service.uploadHealthRecords(requested!.deviceId, randomUUID(), [
            {
                ...canonical,
                externalVersion: 101,
                payload: { samples: [{ time: '2026-08-23T08:00:00Z', bpm: 90 }] },
            },
        ])
        projections = (await database.select().from(schema.observations)).filter(
            observation => observation.sourceRecordId === source.id,
        )
        expect(projections).toHaveLength(6)
        expect(projections.find(item => item.metric === 'heart_rate')?.canonicalValue).toBe(90)
        expect(await database.select().from(schema.dailyMetrics)).toHaveLength(0)
        expect((await database.select().from(schema.projectionDirtyDates)).length).toBeGreaterThan(
            0,
        )
        await new ProjectionWorker(database as never).runOnce(20)
        const daily = await database.select().from(schema.dailyMetrics)
        expect(daily.find(item => item.metric === 'heart_rate')).toMatchObject({
            value: 90,
            unit: 'bpm',
        })
        expect(
            (await database.select().from(schema.journalEntries)).filter(
                entry => entry.entityType === 'health_record' && entry.entityId === source.id,
            ),
        ).toHaveLength(0)
        expect(await service.rebuildHealthRecordObservations()).toEqual({ records: 1 })
        expect(await service.rebuildHealthRecordObservations()).toEqual({ records: 1 })
        expect(
            (await database.select().from(schema.observations)).filter(
                observation => observation.sourceRecordId === source.id,
            ),
        ).toHaveLength(6)

        await service.uploadHealthRecords(requested!.deviceId, randomUUID(), [
            {
                ...canonical,
                recordType: 'StepsRecord',
                externalVersion: Number.MAX_SAFE_INTEGER,
                startTime: '1970-01-01T00:00:00Z',
                endTime: undefined,
                payload: {},
                deleted: true,
            },
        ])
        const [tombstone] = await database
            .select()
            .from(schema.healthRecords)
            .where(eq(schema.healthRecords.externalId, sourceId))
        expect(tombstone.deletedAt).toBeInstanceOf(Date)
        expect(
            (await database.select().from(schema.observations)).filter(
                observation => observation.sourceRecordId === source.id,
            ),
        ).toHaveLength(0)
        expect(
            (await database.select().from(schema.projectionDirtyDates)).some(date =>
                date.date.startsWith('1970-'),
            ),
        ).toBe(false)

        await service.revoke(requested!.deviceId)
        expect(await authenticate(requested?.credential)).toBeNull()
        await expect(
            authenticateDetailed(requested?.credential, { deviceId: requested?.deviceId }),
        ).resolves.toMatchObject({ error: 'device_revoked' })
        await client.close()
    })
})
