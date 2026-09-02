import { createHash, createPublicKey, randomBytes, randomInt, verify } from 'node:crypto'
import { and, desc, eq, gt, gte, isNull, lt, notInArray } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { addCalendarDays, calendarDateKey } from '@trackit/domain/calendar'
import type * as schemaType from '../db/schema.js'
import {
    auditEvents,
    devices,
    deviceRequestNonces,
    deviceUploadBatches,
    healthRecords,
    observations,
    pairingCodes,
    preferences,
    sources,
    syncCursors,
} from '../db/schema.js'
import { normalizeHealthRecord, normalizeHealthRecordInput } from '../health-records/normalize.js'
import { markProjectionDatesDirty } from '../data/projection-state.js'
import { insertHealthObservationGraph } from '../health-records/projection.js'
import type { CanonicalHealthRecordInput } from '../health-records/types.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const deletionTombstoneVersion = Number.MAX_SAFE_INTEGER

export type DeviceAuthenticationFailure =
    | 'missing_credentials'
    | 'invalid_nonce'
    | 'clock_skew'
    | 'device_not_found'
    | 'device_not_confirmed'
    | 'device_revoked'
    | 'signature_mismatch'
    | 'nonce_replay'

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
    ): Promise<
        | { deviceId: string; credential: string; status: string; serverIdentity: string }
        | {
              error: string
              error_details: { message: string; error: string }
              serverIdentity?: string
          }
    > {
        if (expectedServerIdentity !== this.serverIdentity) {
            return {
                error: 'identity_mismatch',
                error_details: {
                    message: 'Server identity mismatch. Verify the server address and identity.',
                    error: 'identity_mismatch',
                },
                serverIdentity: this.serverIdentity,
            }
        }
        const keyBytes = Buffer.from(publicKey, 'base64')
        if (createHash('sha256').update(keyBytes).digest('base64url') !== keyFingerprint) {
            return {
                error: 'invalid',
                error_details: {
                    message: 'Invalid pairing code. Please check the code and try again.',
                    error: 'invalid',
                },
            }
        }
        const now = new Date()
        return this.database.transaction(async transaction => {
            const [consumed] = await transaction
                .update(pairingCodes)
                .set({ usedAt: now })
                .where(
                    and(
                        eq(pairingCodes.codeHash, hash(code)),
                        isNull(pairingCodes.usedAt),
                        gt(pairingCodes.expiresAt, now),
                    ),
                )
                .returning()
            if (!consumed) {
                return {
                    error: 'expired',
                    error_details: {
                        message: 'Pairing code has expired. Please generate a new code.',
                        error: 'expired',
                    },
                }
            }
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
        const now = new Date()
        const [device] = await this.database
            .update(devices)
            .set({
                status: 'confirmed',
                confirmedAt: now,
                configuredAt: now,
            })
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

    async reject(id: string) {
        const now = new Date()
        const [device] = await this.database
            .update(devices)
            .set({
                status: 'revoked',
                revokedAt: now,
            })
            .where(
                and(eq(devices.id, id), eq(devices.status, 'pending'), isNull(devices.revokedAt)),
            )
            .returning()
        if (device) {
            await this.database.insert(auditEvents).values({
                actor: 'owner',
                action: 'device.pairing.rejected',
                targetType: 'device',
                targetId: id,
            })
        }
        return device ?? null
    }

    async authenticateDetailed(input: {
        credential?: string
        deviceId?: string
        method: string
        path: string
        timestamp?: string
        nonce?: string
        bodyHash: string
        signature?: string
    }): Promise<
        | { device: typeof devices.$inferSelect }
        | { error: DeviceAuthenticationFailure; serverTime: string }
    > {
        const failure = (error: DeviceAuthenticationFailure) => ({
            error,
            serverTime: new Date().toISOString(),
        })
        const { credential, deviceId, timestamp, nonce, signature } = input
        if (!credential || !deviceId || !timestamp || !nonce || !signature)
            return failure('missing_credentials')
        if (!/^[A-Za-z0-9_-]{16,200}$/.test(nonce)) return failure('invalid_nonce')
        const signedAt = Number(timestamp)
        if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > 60_000)
            return failure('clock_skew')
        const [device] = await this.database
            .select()
            .from(devices)
            .where(and(eq(devices.credentialHash, hash(credential)), eq(devices.id, deviceId)))
            .limit(1)
        if (!device) return failure('device_not_found')
        if (device.revokedAt || device.status === 'revoked') return failure('device_revoked')
        if (device.status !== 'confirmed') return failure('device_not_confirmed')
        const canonical = [
            input.method.toUpperCase(),
            input.path,
            timestamp,
            nonce,
            input.bodyHash,
            device.id,
        ].join('\n')
        const validSignature = (() => {
            try {
                const publicKey = createPublicKey({
                    key: Buffer.from(device.publicKey, 'base64'),
                    format: 'der',
                    type: 'spki',
                })
                return verify(
                    'sha256',
                    Buffer.from(canonical),
                    publicKey,
                    Buffer.from(signature, 'base64url'),
                )
            } catch {
                return false
            }
        })()
        if (!validSignature) return failure('signature_mismatch')
        const [claimed] = await this.database
            .insert(deviceRequestNonces)
            .values({
                nonceHash: hash(`${device.id}:${nonce}`),
                deviceId: device.id,
                expiresAt: new Date(signedAt + 60_000),
            })
            .onConflictDoNothing()
            .returning({ nonceHash: deviceRequestNonces.nonceHash })
        if (!claimed) return failure('nonce_replay')
        await this.database
            .update(devices)
            .set({ lastSeenAt: new Date() })
            .where(eq(devices.id, device.id))
        return { device }
    }

    async authenticate(input: Parameters<DeviceService['authenticateDetailed']>[0]) {
        const result = await this.authenticateDetailed(input)
        return 'device' in result ? result.device : null
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
                configuredAt: devices.configuredAt,
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

    async delete(id: string) {
        await this.database.delete(devices).where(eq(devices.id, id))
        await this.database.insert(auditEvents).values({
            actor: 'owner',
            action: 'device.deleted',
            targetType: 'device',
            targetId: id,
        })
    }

    async uploadHealthRecords(
        deviceId: string,
        idempotencyKey: string,
        records: CanonicalHealthRecordInput[],
    ) {
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

            const affectedDates = new Set<string>()
            for (const sourceInput of records) {
                const input = normalizeHealthRecordInput(sourceInput)
                const now = new Date()
                const connector = input.provider
                const provider = input.dataOrigin ?? input.provider
                const startTime = new Date(input.startTime)
                const endTime = input.endTime ? new Date(input.endTime) : null
                const deletedAt = input.deleted ? now : null
                await transaction
                    .insert(healthRecords)
                    .values({
                        userId: 'owner',
                        connector,
                        provider,
                        recordType: input.recordType,
                        externalId: input.externalId,
                        externalVersion: input.externalVersion,
                        startTime,
                        endTime,
                        dataOrigin: input.dataOrigin,
                        recordingMethod: input.recordingMethod,
                        device: input.device ?? {},
                        payload: input.payload,
                        lastModifiedTime: input.lastModifiedTime
                            ? new Date(input.lastModifiedTime)
                            : undefined,
                        deletedAt,
                    })
                    .onConflictDoUpdate({
                        target: [
                            healthRecords.userId,
                            healthRecords.connector,
                            healthRecords.externalId,
                        ],
                        setWhere: lt(healthRecords.externalVersion, input.externalVersion),
                        set: {
                            recordType: input.deleted ? undefined : input.recordType,
                            externalVersion: input.externalVersion,
                            startTime: input.deleted ? undefined : startTime,
                            endTime: input.deleted ? undefined : endTime,
                            provider: input.deleted ? undefined : provider,
                            dataOrigin: input.deleted ? undefined : input.dataOrigin,
                            recordingMethod: input.deleted ? undefined : input.recordingMethod,
                            device: input.deleted ? undefined : (input.device ?? {}),
                            payload: input.deleted ? undefined : input.payload,
                            lastModifiedTime: input.lastModifiedTime
                                ? new Date(input.lastModifiedTime)
                                : undefined,
                            deletedAt,
                            updatedAt: now,
                        },
                    })

                const [stored] = await transaction
                    .select()
                    .from(healthRecords)
                    .where(
                        and(
                            eq(healthRecords.userId, 'owner'),
                            eq(healthRecords.connector, connector),
                            eq(healthRecords.externalId, input.externalId),
                        ),
                    )
                    .limit(1)
                if (!stored || stored.externalVersion !== input.externalVersion) continue

                const previousProjections = await transaction
                    .select({
                        observedAt: observations.observedAt,
                        endedAt: observations.endedAt,
                    })
                    .from(observations)
                    .where(eq(observations.sourceRecordId, stored.id))
                const [saved] = await transaction
                    .select({ timezone: preferences.timezone })
                    .from(preferences)
                    .where(eq(preferences.id, 'owner'))
                const timezone = saved?.timezone ?? 'UTC'
                for (const projection of previousProjections) {
                    affectedDates.add(calendarDateKey(projection.observedAt, timezone))
                    if (projection.endedAt)
                        affectedDates.add(calendarDateKey(projection.endedAt, timezone))
                }
                await transaction
                    .delete(observations)
                    .where(eq(observations.sourceRecordId, stored.id))
                if (!stored.deletedAt) {
                    const projections = await insertHealthObservationGraph(transaction, {
                        ...input,
                        id: stored.id,
                        userId: stored.userId,
                        startTime: stored.startTime,
                        endTime: stored.endTime,
                    })
                    for (const projection of projections) {
                        if (projection.observedAt)
                            affectedDates.add(calendarDateKey(projection.observedAt, timezone))
                        if (projection.endedAt)
                            affectedDates.add(calendarDateKey(projection.endedAt, timezone))
                    }
                }
            }

            for (const date of affectedDates) await this.markDailyDateDirty(transaction, date)
            await transaction.insert(deviceUploadBatches).values({
                deviceId,
                idempotencyKey,
                recordCount: records.length,
            })
            return { duplicate: false, accepted: records.length }
        })
    }

    async rebuildHealthRecordObservations() {
        const batchSize = 250
        let cursor: string | undefined
        let rebuilt = 0

        while (true) {
            const records = await this.database
                .select()
                .from(healthRecords)
                .where(
                    cursor
                        ? and(isNull(healthRecords.deletedAt), gt(healthRecords.id, cursor))
                        : isNull(healthRecords.deletedAt),
                )
                .orderBy(healthRecords.id)
                .limit(batchSize)

            if (!records.length) break

            await this.database.transaction(async transaction => {
                const dates = new Set<string>()

                for (const stored of records) {
                    await transaction
                        .delete(observations)
                        .where(eq(observations.sourceRecordId, stored.id))

                    dates.add(stored.startTime.toISOString().slice(0, 10))
                    if (stored.endTime) dates.add(stored.endTime.toISOString().slice(0, 10))

                    const record = normalizeHealthRecord({
                        id: stored.id,
                        userId: stored.userId,
                        connector: stored.connector,
                        provider: stored.provider,
                        recordType: stored.recordType,
                        externalId: stored.externalId,
                        externalVersion: stored.externalVersion,
                        startTime: stored.startTime,
                        endTime: stored.endTime,
                        dataOrigin: stored.dataOrigin ?? undefined,
                        recordingMethod: stored.recordingMethod ?? undefined,
                        device: stored.device as Record<string, unknown>,
                        payload: stored.payload as Record<string, unknown>,
                        lastModifiedTime: stored.lastModifiedTime?.toISOString(),
                    })
                    if (record.recordType === 'ExerciseSessionRecord')
                        await transaction
                            .update(healthRecords)
                            .set({ payload: record.payload })
                            .where(eq(healthRecords.id, stored.id))
                    const projections = await insertHealthObservationGraph(transaction, record)

                    for (const projection of projections) {
                        if (projection.observedAt)
                            dates.add(projection.observedAt.toISOString().slice(0, 10))
                        if (projection.endedAt)
                            dates.add(projection.endedAt.toISOString().slice(0, 10))
                    }
                }

                for (const date of dates) await this.markDailyDateDirty(transaction, date)
            })

            rebuilt += records.length
            cursor = records.at(-1)!.id
        }

        return { records: rebuilt }
    }

    async reconcileHealthRecords(
        deviceId: string,
        recordType: string,
        since: string,
        presentExternalIds: string[],
    ) {
        return this.database.transaction(async transaction => {
            const conditions = [
                eq(healthRecords.userId, 'owner'),
                eq(healthRecords.connector, 'health_connect'),
                eq(healthRecords.recordType, recordType),
                gte(healthRecords.startTime, new Date(since)),
                isNull(healthRecords.deletedAt),
            ]
            if (presentExternalIds.length)
                conditions.push(notInArray(healthRecords.externalId, presentExternalIds))
            const stale = await transaction
                .select()
                .from(healthRecords)
                .where(and(...conditions))
            const [saved] = await transaction
                .select({ timezone: preferences.timezone })
                .from(preferences)
                .where(eq(preferences.id, 'owner'))
            const timezone = saved?.timezone ?? 'UTC'
            const dates = new Set<string>()
            for (const record of stale) {
                const prior = await transaction
                    .select({ observedAt: observations.observedAt, endedAt: observations.endedAt })
                    .from(observations)
                    .where(eq(observations.sourceRecordId, record.id))
                for (const item of prior) {
                    dates.add(calendarDateKey(item.observedAt, timezone))
                    if (item.endedAt) dates.add(calendarDateKey(item.endedAt, timezone))
                }
                await transaction
                    .update(healthRecords)
                    .set({
                        externalVersion: deletionTombstoneVersion,
                        deletedAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(healthRecords.id, record.id))
                await transaction
                    .delete(observations)
                    .where(eq(observations.sourceRecordId, record.id))
            }
            for (const date of dates) await this.markDailyDateDirty(transaction, date)
            return { reconciled: stale.length, deviceId }
        })
    }

    private async markDailyDateDirty(transaction: Transaction, date: string) {
        await markProjectionDatesDirty(transaction, [
            addCalendarDays(date, -1),
            date,
            addCalendarDays(date, 1),
        ])
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
