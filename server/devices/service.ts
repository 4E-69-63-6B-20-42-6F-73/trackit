import { createHash, createPublicKey, randomBytes, randomInt, verify } from 'node:crypto'
import { and, desc, eq, gte, gt, isNull, lt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    auditEvents,
    devices,
    deviceRequestNonces,
    deviceUploadBatches,
    dailyMetrics,
    healthRecords,
    journalEntries,
    observations,
    pairingCodes,
    sources,
    syncCursors,
} from '../db/schema.js'
import { deriveRecord } from '../health-records/derive.js'
import { projectHealthRecordToJournal } from '../health-records/journal.js'
import { aggregateMetric, metricDefinition } from '../health-records/metric-registry.js'
import type { CanonicalHealthRecordInput } from '../health-records/types.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
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
                    const observedAt = new Date(record.observedAt)
                    const endedAt = record.endedAt ? new Date(record.endedAt) : undefined

                    // For sleep records, use the end time to determine the "sleep date"
                    const effectiveObservedAt =
                        record.metric === 'sleep' &&
                        endedAt &&
                        endedAt.getTime() > observedAt.getTime()
                            ? endedAt
                            : observedAt

                    await transaction
                        .insert(observations)
                        .values({
                            metric: record.metric,
                            canonicalValue: record.value,
                            canonicalUnit: record.unit,
                            originalValue: record.value,
                            originalUnit: record.unit,
                            observedAt: effectiveObservedAt,
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
                const observedAt = new Date(record.observedAt)
                const endedAt = record.endedAt ? new Date(record.endedAt) : undefined

                // For sleep records, use the end time to determine the "sleep date"
                // Sleep that spans midnight is attributed to the day you wake up in
                const effectiveObservedAt =
                    record.metric === 'sleep' && endedAt && endedAt.getTime() > observedAt.getTime()
                        ? endedAt
                        : observedAt

                await transaction
                    .insert(observations)
                    .values({
                        metric: record.metric,
                        canonicalValue: record.value,
                        canonicalUnit: record.unit,
                        originalValue: record.value,
                        originalUnit: record.unit,
                        observedAt: effectiveObservedAt,
                        endedAt,
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
                            observedAt: effectiveObservedAt,
                            endedAt,
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
            for (const input of records) {
                const now = new Date()
                const startTime = new Date(input.startTime)
                const endTime = input.endTime ? new Date(input.endTime) : null
                const [previous] = await transaction
                    .select()
                    .from(healthRecords)
                    .where(
                        and(
                            eq(healthRecords.userId, 'owner'),
                            eq(healthRecords.provider, input.provider),
                            eq(healthRecords.externalId, input.externalId),
                        ),
                    )
                    .limit(1)

                if (previous)
                    affectedDates.add(
                        this.metricDate(previous.recordType, previous.startTime, previous.endTime),
                    )
                const deletedAt = input.deleted ? now : null
                await transaction
                    .insert(healthRecords)
                    .values({
                        userId: 'owner',
                        provider: input.provider,
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
                            healthRecords.provider,
                            healthRecords.externalId,
                        ],
                        setWhere: lt(healthRecords.externalVersion, input.externalVersion),
                        set: {
                            recordType: input.recordType,
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
                            updatedAt: now,
                        },
                    })

                const [stored] = await transaction
                    .select()
                    .from(healthRecords)
                    .where(
                        and(
                            eq(healthRecords.userId, 'owner'),
                            eq(healthRecords.provider, input.provider),
                            eq(healthRecords.externalId, input.externalId),
                        ),
                    )
                    .limit(1)
                if (!stored || stored.externalVersion !== input.externalVersion) continue

                affectedDates.add(
                    this.metricDate(stored.recordType, stored.startTime, stored.endTime),
                )
                await transaction
                    .delete(observations)
                    .where(eq(observations.sourceRecordId, stored.id))
                if (stored.deletedAt)
                    await transaction
                        .update(journalEntries)
                        .set({ deletedAt: now, updatedAt: now })
                        .where(
                            and(
                                eq(journalEntries.entityType, 'health_record'),
                                eq(journalEntries.entityId, stored.id),
                            ),
                        )
                if (!stored.deletedAt) {
                    const projections = deriveRecord({
                        ...input,
                        id: stored.id,
                        userId: stored.userId,
                        startTime: stored.startTime,
                        endTime: stored.endTime,
                    })
                    if (projections.length)
                        await transaction.insert(observations).values(
                            projections.map(projection => ({
                                userId: stored.userId,
                                metric: projection.metric,
                                canonicalValue: projection.value,
                                canonicalUnit: projection.unit,
                                originalValue: projection.value,
                                originalUnit: projection.unit,
                                observedAt: projection.observedAt!,
                                endedAt: projection.endedAt,
                                sourceId: deviceId,
                                externalId: `${stored.externalId}:${projection.metric}:v${projection.derivationVersion}`,
                                kind: projection.kind,
                                sourceRecordId: stored.id,
                                derivation: projection.derivation,
                                derivationVersion: projection.derivationVersion,
                                version: stored.externalVersion,
                                metadata: {
                                    source: 'Health Connect',
                                    dataOrigin: stored.dataOrigin,
                                },
                            })),
                        )
                    const journal = projectHealthRecordToJournal(
                        {
                            ...input,
                            id: stored.id,
                            userId: stored.userId,
                            startTime: stored.startTime,
                            endTime: stored.endTime,
                        },
                        projections,
                    )
                    if (journal)
                        await transaction
                            .insert(journalEntries)
                            .values({
                                id: stored.id,
                                ...journal,
                                sourceId: deviceId,
                                sourceLabel: stored.dataOrigin
                                    ? `Health Connect · ${stored.dataOrigin}`
                                    : 'Health Connect',
                                observedAt:
                                    stored.recordType === 'SleepSessionRecord' && stored.endTime
                                        ? stored.endTime
                                        : stored.startTime,
                                externalId: `${stored.provider}:${stored.externalId}`,
                                entityType: 'health_record',
                                entityId: stored.id,
                            })
                            .onConflictDoUpdate({
                                target: journalEntries.id,
                                set: {
                                    ...journal,
                                    sourceId: deviceId,
                                    sourceLabel: stored.dataOrigin
                                        ? `Health Connect · ${stored.dataOrigin}`
                                        : 'Health Connect',
                                    observedAt:
                                        stored.recordType === 'SleepSessionRecord' && stored.endTime
                                            ? stored.endTime
                                            : stored.startTime,
                                    deletedAt: null,
                                    updatedAt: now,
                                },
                            })
                }
            }

            for (const date of affectedDates) await this.rebuildDailyDate(transaction, date)
            await transaction.insert(deviceUploadBatches).values({
                deviceId,
                idempotencyKey,
                recordCount: records.length,
            })
            return { duplicate: false, accepted: records.length }
        })
    }

    async rebuildHealthRecordObservations() {
        return this.database.transaction(async transaction => {
            const rebuiltAt = new Date()
            await transaction
                .update(journalEntries)
                .set({ deletedAt: rebuiltAt, updatedAt: rebuiltAt })
                .where(eq(journalEntries.entityType, 'health_record'))
            const records = await transaction
                .select()
                .from(healthRecords)
                .where(isNull(healthRecords.deletedAt))
            const dates = new Set<string>()
            for (const stored of records) {
                dates.add(this.metricDate(stored.recordType, stored.startTime, stored.endTime))
                await transaction
                    .delete(observations)
                    .where(eq(observations.sourceRecordId, stored.id))
                const projections = deriveRecord({
                    id: stored.id,
                    userId: stored.userId,
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
                if (projections.length)
                    await transaction.insert(observations).values(
                        projections.map(projection => ({
                            userId: stored.userId,
                            metric: projection.metric,
                            canonicalValue: projection.value,
                            canonicalUnit: projection.unit,
                            originalValue: projection.value,
                            originalUnit: projection.unit,
                            observedAt: projection.observedAt!,
                            endedAt: projection.endedAt,
                            externalId: `${stored.externalId}:${projection.metric}:v${projection.derivationVersion}`,
                            kind: projection.kind,
                            sourceRecordId: stored.id,
                            derivation: projection.derivation,
                            derivationVersion: projection.derivationVersion,
                            version: stored.externalVersion,
                            metadata: { source: 'Health Connect', dataOrigin: stored.dataOrigin },
                        })),
                    )
                const journal = projectHealthRecordToJournal(
                    {
                        id: stored.id,
                        userId: stored.userId,
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
                    },
                    projections,
                )
                if (journal)
                    await transaction
                        .insert(journalEntries)
                        .values({
                            id: stored.id,
                            ...journal,
                            sourceLabel: stored.dataOrigin
                                ? `Health Connect · ${stored.dataOrigin}`
                                : 'Health Connect',
                            observedAt:
                                stored.recordType === 'SleepSessionRecord' && stored.endTime
                                    ? stored.endTime
                                    : stored.startTime,
                            externalId: `${stored.provider}:${stored.externalId}`,
                            entityType: 'health_record',
                            entityId: stored.id,
                        })
                        .onConflictDoUpdate({
                            target: journalEntries.id,
                            set: {
                                ...journal,
                                sourceLabel: stored.dataOrigin
                                    ? `Health Connect · ${stored.dataOrigin}`
                                    : 'Health Connect',
                                observedAt:
                                    stored.recordType === 'SleepSessionRecord' && stored.endTime
                                        ? stored.endTime
                                        : stored.startTime,
                                deletedAt: null,
                                updatedAt: rebuiltAt,
                            },
                        })
            }
            for (const date of dates) await this.rebuildDailyDate(transaction, date)
            return { records: records.length }
        })
    }

    private metricDate(recordType: string, startTime: Date, endTime: Date | null) {
        const instant = recordType === 'SleepSessionRecord' && endTime ? endTime : startTime
        return instant.toISOString().slice(0, 10)
    }

    private async rebuildDailyDate(transaction: Transaction, date: string) {
        const from = new Date(`${date}T00:00:00.000Z`)
        const to = new Date(from.getTime() + 86_400_000)
        const rows = await transaction
            .select({
                metric: observations.metric,
                value: observations.canonicalValue,
                unit: observations.canonicalUnit,
                observedAt: observations.observedAt,
                derivationVersion: observations.derivationVersion,
            })
            .from(observations)
            .where(
                and(
                    eq(observations.userId, 'owner'),
                    isNull(observations.deletedAt),
                    gte(observations.observedAt, from),
                    lt(observations.observedAt, to),
                ),
            )
        await transaction
            .delete(dailyMetrics)
            .where(and(eq(dailyMetrics.userId, 'owner'), eq(dailyMetrics.date, date)))
        const byMetric = new Map<string, typeof rows>()
        for (const row of rows) byMetric.set(row.metric, [...(byMetric.get(row.metric) ?? []), row])
        for (const [metric, values] of byMetric) {
            const definition = metricDefinition(metric)
            if (!definition || !values.length) continue
            const aggregate = aggregateMetric(definition.aggregation, values)!
            await transaction.insert(dailyMetrics).values({
                userId: 'owner',
                date,
                metric,
                value: aggregate,
                unit: definition.canonicalUnit,
                derivationVersion: Math.max(...values.map(row => row.derivationVersion ?? 1)),
            })
        }
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
