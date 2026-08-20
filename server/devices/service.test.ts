import { readFile, readdir } from 'node:fs/promises'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { DeviceService } from './service.js'

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
        const authenticate = (credential?: string) => {
            const timestamp = Date.now().toString()
            const signature = sign('sha256', Buffer.from(timestamp), keyPair.privateKey).toString(
                'base64url',
            )
            return service.authenticate(credential, timestamp, signature)
        }
        const pairing = await service.createPairingCode()
        const requested = await service.requestPairing(
            pairing.code,
            'Pixel',
            fingerprint,
            publicKey,
            pairing.serverIdentity,
        )
        expect(requested?.status).toBe('pending')
        expect(
            await service.requestPairing(
                pairing.code,
                'Other',
                fingerprint,
                publicKey,
                pairing.serverIdentity,
            ),
        ).toBeNull()
        expect(await authenticate(requested?.credential)).toBeNull()

        await service.confirm(requested!.deviceId)
        expect(await authenticate(requested?.credential)).not.toBeNull()
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
            observation => observation.externalId === 'deleted-before-import',
        )
        expect(deletedBeforeImport).toMatchObject({
            canonicalValue: 0,
            version: Number.MAX_SAFE_INTEGER,
        })
        expect(deletedBeforeImport?.deletedAt).toBeInstanceOf(Date)

        await service.revoke(requested!.deviceId)
        expect(await authenticate(requested?.credential)).toBeNull()
        await client.close()
    })
})
