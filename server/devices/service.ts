import { createHash, createPublicKey, randomBytes, randomInt, verify } from 'node:crypto'
import { and, desc, eq, gt, isNull, lt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    auditEvents,
    devices,
    deviceUploadBatches,
    observations,
    pairingCodes,
    sources,
    syncCursors,
} from '../db/schema.js'

type Database = PostgresJsDatabase<typeof schemaType>
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const deletionTombstoneVersion = Number.MAX_SAFE_INTEGER

export type DeviceUploadRecord = {
    externalId: string
    metric: string
    value: number
    unit: string
    observedAt: string
    endedAt?: string
    version: number
    dataOrigin: string
    deleted?: boolean
}

export class DeviceService {
    constructor(
        private readonly database: Database,
        private readonly serverIdentity: string,
    ) {}

    async createPairingCode() {
        const code = `${randomInt(1000, 10000)}-${randomInt(1000, 10000)}`
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
        await this.database.insert(pairingCodes).values({ codeHash: hash(code), expiresAt })
        return { code, expiresAt, serverIdentity: this.serverIdentity }
    }

    async requestPairing(
        code: string,
        name: string,
        keyFingerprint: string,
        publicKey: string,
        expectedServerIdentity: string,
    ) {
        if (expectedServerIdentity !== this.serverIdentity) return null
        const keyBytes = Buffer.from(publicKey, 'base64')
        if (createHash('sha256').update(keyBytes).digest('base64url') !== keyFingerprint)
            return null
        return this.database.transaction(async transaction => {
            const [consumed] = await transaction
                .update(pairingCodes)
                .set({ usedAt: new Date() })
                .where(
                    and(
                        eq(pairingCodes.codeHash, hash(code)),
                        isNull(pairingCodes.usedAt),
                        gt(pairingCodes.expiresAt, new Date()),
                    ),
                )
                .returning()
            if (!consumed) return null
            const credential = `trk_device_${randomBytes(32).toString('base64url')}`
            const [device] = await transaction
                .insert(devices)
                .values({ name, keyFingerprint, publicKey, credentialHash: hash(credential) })
                .returning()
            await transaction.insert(auditEvents).values({
                actor: `device:${device.id}`,
                action: 'device.pairing.requested',
                targetType: 'device',
                targetId: device.id,
            })
            return {
                deviceId: device.id,
                credential,
                status: device.status,
                serverIdentity: this.serverIdentity,
            }
        })
    }

    async confirm(id: string) {
        const [device] = await this.database
            .update(devices)
            .set({ status: 'confirmed', confirmedAt: new Date() })
            .where(
                and(eq(devices.id, id), eq(devices.status, 'pending'), isNull(devices.revokedAt)),
            )
            .returning()
        if (device) {
            await this.database.insert(auditEvents).values({
                actor: 'owner',
                action: 'device.pairing.confirmed',
                targetType: 'device',
                targetId: id,
            })
        }
        return device ?? null
    }

    async authenticate(credential?: string, timestamp?: string, signature?: string) {
        if (!credential || !timestamp || !signature) return null
        const signedAt = Number(timestamp)
        if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > 60_000) return null
        const [device] = await this.database
            .select()
            .from(devices)
            .where(
                and(
                    eq(devices.credentialHash, hash(credential)),
                    eq(devices.status, 'confirmed'),
                    isNull(devices.revokedAt),
                ),
            )
            .limit(1)
        if (!device) return null
        const publicKey = createPublicKey({
            key: Buffer.from(device.publicKey, 'base64'),
            format: 'der',
            type: 'spki',
        })
        if (
            !verify(
                'sha256',
                Buffer.from(timestamp),
                publicKey,
                Buffer.from(signature, 'base64url'),
            )
        ) {
            return null
        }
        await this.database
            .update(devices)
            .set({ lastSeenAt: new Date() })
            .where(eq(devices.id, device.id))
        return device
    }

    async pairingStatus(credential?: string, keyFingerprint?: string) {
        if (!credential || !keyFingerprint) return null
        const [device] = await this.database
            .select({ id: devices.id, status: devices.status, revokedAt: devices.revokedAt })
            .from(devices)
            .where(
                and(
                    eq(devices.credentialHash, hash(credential)),
                    eq(devices.keyFingerprint, keyFingerprint),
                ),
            )
            .limit(1)
        return device ?? null
    }

    async list() {
        const records = await this.database
            .select({
                id: devices.id,
                name: devices.name,
                keyFingerprint: devices.keyFingerprint,
                status: devices.status,
                confirmedAt: devices.confirmedAt,
                revokedAt: devices.revokedAt,
                lastSeenAt: devices.lastSeenAt,
                createdAt: devices.createdAt,
            })
            .from(devices)
            .orderBy(desc(devices.createdAt))
        return Promise.all(
            records.map(async device => ({
                ...device,
                sync: await this.database
                    .select({
                        recordType: syncCursors.recordType,
                        status: syncCursors.status,
                        lastSyncedAt: syncCursors.lastSyncedAt,
                        diagnostic: syncCursors.diagnostic,
                    })
                    .from(syncCursors)
                    .where(eq(syncCursors.deviceId, device.id))
                    .orderBy(syncCursors.recordType),
            })),
        )
    }

    async revoke(id: string) {
        await this.database
            .update(devices)
            .set({ revokedAt: new Date(), status: 'revoked' })
            .where(eq(devices.id, id))
        await this.database.insert(auditEvents).values({
            actor: 'owner',
            action: 'device.revoked',
            targetType: 'device',
            targetId: id,
        })
    }

    async upload(deviceId: string, idempotencyKey: string, records: DeviceUploadRecord[]) {
        return this.database.transaction(async transaction => {
            const [existing] = await transaction
                .select({ id: deviceUploadBatches.id })
                .from(deviceUploadBatches)
                .where(
                    and(
                        eq(deviceUploadBatches.deviceId, deviceId),
                        eq(deviceUploadBatches.idempotencyKey, idempotencyKey),
                    ),
                )
                .limit(1)
            if (existing) return { duplicate: true, accepted: records.length }

            await transaction
                .insert(sources)
                .values({
                    id: deviceId,
                    kind: 'health_connect',
                    name: 'Health Connect',
                    externalOrigin: 'android',
                })
                .onConflictDoNothing({ target: sources.id })

            for (const record of records) {
                if (record.deleted) {
                    const deletedAt = new Date()
                    await transaction
                        .insert(observations)
                        .values({
                            metric: record.metric,
                            canonicalValue: record.value,
                            canonicalUnit: record.unit,
                            originalValue: record.value,
                            originalUnit: record.unit,
                            observedAt: new Date(record.observedAt),
                            sourceId: deviceId,
                            externalId: record.externalId,
                            version: deletionTombstoneVersion,
                            deletedAt,
                            metadata: {
                                source: 'Health Connect',
                                dataOrigin: record.dataOrigin,
                            },
                        })
                        .onConflictDoUpdate({
                            target: [observations.sourceId, observations.externalId],
                            set: {
                                version: deletionTombstoneVersion,
                                deletedAt,
                                updatedAt: deletedAt,
                            },
                        })
                    continue
                }
                await transaction
                    .insert(observations)
                    .values({
                        metric: record.metric,
                        canonicalValue: record.value,
                        canonicalUnit: record.unit,
                        originalValue: record.value,
                        originalUnit: record.unit,
                        observedAt: new Date(record.observedAt),
                        endedAt: record.endedAt ? new Date(record.endedAt) : undefined,
                        sourceId: deviceId,
                        externalId: record.externalId,
                        version: record.version,
                        metadata: {
                            source: 'Health Connect',
                            dataOrigin: record.dataOrigin,
                        },
                    })
                    .onConflictDoUpdate({
                        target: [observations.sourceId, observations.externalId],
                        setWhere: lt(observations.version, record.version),
                        set: {
                            canonicalValue: record.value,
                            canonicalUnit: record.unit,
                            originalValue: record.value,
                            originalUnit: record.unit,
                            observedAt: new Date(record.observedAt),
                            endedAt: record.endedAt ? new Date(record.endedAt) : null,
                            version: record.version,
                            deletedAt: null,
                            updatedAt: new Date(),
                            metadata: {
                                source: 'Health Connect',
                                dataOrigin: record.dataOrigin,
                            },
                        },
                    })
            }
            await transaction.insert(deviceUploadBatches).values({
                deviceId,
                idempotencyKey,
                recordCount: records.length,
            })
            return { duplicate: false, accepted: records.length }
        })
    }

    async updateCursor(
        deviceId: string,
        recordType: string,
        cursor: string | null,
        status: string,
    ) {
        await this.database
            .insert(syncCursors)
            .values({ deviceId, recordType, cursor, status, lastSyncedAt: new Date() })
            .onConflictDoUpdate({
                target: [syncCursors.deviceId, syncCursors.recordType],
                set: { cursor, status, lastSyncedAt: new Date(), diagnostic: null },
            })
    }
}
