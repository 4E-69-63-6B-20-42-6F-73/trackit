import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { addCalendarDays, calendarDateKey } from '@trackit/domain/calendar'
import type * as schemaType from '../db/schema.js'
import {
    deviceUploadBatches,
    healthRecords,
    observations,
    preferences,
    sources,
} from '../db/schema.js'
import { DailyProjectionCoordinator } from '../data/projection-coordinator.js'
import { markProjectionDatesDirty } from '../data/projection-state.js'
import { normalizeHealthRecordInput } from '../health-records/normalize.js'
import { insertHealthObservationGraphs } from '../health-records/projection.js'
import type { CanonicalHealthRecord, CanonicalHealthRecordInput } from '../health-records/types.js'
import { DeviceService as DeviceServiceCore } from './service-core.js'

export type { DeviceAuthenticationFailure } from './service-core.js'

type Database = PostgresJsDatabase<typeof schemaType>
type UploadTimings = {
    normalizeMs: number
    preloadMs: number
    writeMs: number
    projectionMs: number
    invalidationMs: number
    totalMs: number
    received: number
    changed: number
    skipped: number
}
type UploadResult = { duplicate: boolean; accepted: number; timings?: UploadTimings }
type UploadTransactionResult = {
    result: UploadResult
    affectedDates: Set<string>
    timings: Omit<UploadTimings, 'invalidationMs' | 'totalMs'>
}
const deletionTombstoneVersion = Number.MAX_SAFE_INTEGER
const QUERY_CHUNK_SIZE = 1000

const nowMs = () => performance.now()
const durationMs = (startedAt: number) => Math.round((nowMs() - startedAt) * 100) / 100
const identity = (connector: string, externalId: string) => `${connector}\u0000${externalId}`
const chunks = <T>(items: T[], size = QUERY_CHUNK_SIZE) => {
    const result: T[][] = []
    for (let index = 0; index < items.length; index += size)
        result.push(items.slice(index, index + size))
    return result
}

const isUploadIdempotencyConflict = (error: unknown) => {
    let current = error
    for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
        if (current.message.includes('device_upload_idempotency_idx')) return true
        current = (current as Error & { cause?: unknown }).cause
    }
    return false
}

const expandedDirtyDates = (dates: Iterable<string>) => {
    const result = new Set<string>()
    for (const date of dates) {
        result.add(addCalendarDays(date, -1))
        result.add(date)
        result.add(addCalendarDays(date, 1))
    }
    return result
}

export class DeviceService extends DeviceServiceCore {
    private readonly projections: DailyProjectionCoordinator
    private readonly inFlightUploads = new Map<string, Promise<UploadResult>>()

    constructor(
        private readonly database: Database,
        serverIdentity: string,
    ) {
        super(database, serverIdentity)
        this.projections = new DailyProjectionCoordinator(database)
    }

    override async uploadHealthRecords(
        deviceId: string,
        idempotencyKey: string,
        records: CanonicalHealthRecordInput[],
    ): Promise<UploadResult> {
        const key = `${deviceId}:${idempotencyKey}`
        const existing = this.inFlightUploads.get(key)
        if (existing) return existing

        const upload = (async (): Promise<UploadResult> => {
            const totalStartedAt = nowMs()
            try {
                const transactionResult = await this.uploadHealthRecordsBulk(
                    deviceId,
                    idempotencyKey,
                    records,
                )
                if (transactionResult.result.duplicate) return transactionResult.result

                const invalidationStartedAt = nowMs()
                if (transactionResult.affectedDates.size)
                    await this.projections.invalidateCarryForwardDependents(
                        transactionResult.affectedDates,
                    )
                const invalidationMs = durationMs(invalidationStartedAt)
                return {
                    ...transactionResult.result,
                    timings: {
                        ...transactionResult.timings,
                        invalidationMs,
                        totalMs: durationMs(totalStartedAt),
                    },
                }
            } catch (error) {
                if (isUploadIdempotencyConflict(error)) {
                    return { duplicate: true, accepted: records.length }
                }
                throw error
            } finally {
                this.inFlightUploads.delete(key)
            }
        })()

        this.inFlightUploads.set(key, upload)
        return upload
    }

    private async uploadHealthRecordsBulk(
        deviceId: string,
        idempotencyKey: string,
        records: CanonicalHealthRecordInput[],
    ): Promise<UploadTransactionResult> {
        return this.database.transaction(async transaction => {
            const [existingBatch] = await transaction
                .select({ id: deviceUploadBatches.id })
                .from(deviceUploadBatches)
                .where(
                    and(
                        eq(deviceUploadBatches.deviceId, deviceId),
                        eq(deviceUploadBatches.idempotencyKey, idempotencyKey),
                    ),
                )
                .limit(1)
            if (existingBatch) {
                return {
                    result: { duplicate: true, accepted: records.length },
                    affectedDates: new Set<string>(),
                    timings: {
                        normalizeMs: 0,
                        preloadMs: 0,
                        writeMs: 0,
                        projectionMs: 0,
                        received: records.length,
                        changed: 0,
                        skipped: records.length,
                    },
                }
            }

            await transaction
                .insert(sources)
                .values({
                    id: deviceId,
                    kind: 'health_connect',
                    name: 'Health Connect',
                    externalOrigin: 'android',
                })
                .onConflictDoNothing({ target: sources.id })

            const normalizeStartedAt = nowMs()
            const normalizedByIdentity = new Map<string, CanonicalHealthRecordInput>()
            for (const sourceInput of records) {
                const input = normalizeHealthRecordInput(sourceInput)
                const key = identity(input.provider, input.externalId)
                const current = normalizedByIdentity.get(key)
                if (!current || current.externalVersion < input.externalVersion)
                    normalizedByIdentity.set(key, input)
            }
            const normalized = [...normalizedByIdentity.values()]
            const normalizeMs = durationMs(normalizeStartedAt)

            const preloadStartedAt = nowMs()
            const externalIds = [...new Set(normalized.map(input => input.externalId))]
            const existingRecords = externalIds.length
                ? await transaction
                      .select()
                      .from(healthRecords)
                      .where(
                          and(
                              eq(healthRecords.userId, 'owner'),
                              inArray(healthRecords.externalId, externalIds),
                          ),
                      )
                : []
            const existingByIdentity = new Map(
                existingRecords.map(record => [
                    identity(record.connector, record.externalId),
                    record,
                ]),
            )
            const changedInputs = normalized.filter(input => {
                const existing = existingByIdentity.get(identity(input.provider, input.externalId))
                return !existing || existing.externalVersion < input.externalVersion
            })
            const [saved] = await transaction
                .select({ timezone: preferences.timezone })
                .from(preferences)
                .where(eq(preferences.id, 'owner'))
            const timezone = saved?.timezone ?? 'UTC'
            const preloadMs = durationMs(preloadStartedAt)

            const writeStartedAt = nowMs()
            const liveInputs = changedInputs.filter(input => !input.deleted)
            const deletedInputs = changedInputs.filter(input => input.deleted)
            const storedRows: (typeof healthRecords.$inferSelect)[] = []

            if (liveInputs.length) {
                const now = new Date()
                const returned = await transaction
                    .insert(healthRecords)
                    .values(
                        liveInputs.map(input => ({
                            userId: 'owner',
                            connector: input.provider,
                            provider: input.dataOrigin ?? input.provider,
                            recordType: input.recordType,
                            externalId: input.externalId,
                            externalVersion: input.externalVersion,
                            startTime: new Date(input.startTime),
                            endTime: input.endTime ? new Date(input.endTime) : null,
                            dataOrigin: input.dataOrigin,
                            recordingMethod: input.recordingMethod,
                            device: input.device ?? {},
                            payload: input.payload,
                            lastModifiedTime: input.lastModifiedTime
                                ? new Date(input.lastModifiedTime)
                                : undefined,
                            deletedAt: null,
                        })),
                    )
                    .onConflictDoUpdate({
                        target: [
                            healthRecords.userId,
                            healthRecords.connector,
                            healthRecords.externalId,
                        ],
                        setWhere: lt(healthRecords.externalVersion, sql`excluded.external_version`),
                        set: {
                            recordType: sql`excluded.record_type`,
                            externalVersion: sql`excluded.external_version`,
                            startTime: sql`excluded.start_time`,
                            endTime: sql`excluded.end_time`,
                            provider: sql`excluded.provider`,
                            dataOrigin: sql`excluded.data_origin`,
                            recordingMethod: sql`excluded.recording_method`,
                            device: sql`excluded.device`,
                            payload: sql`excluded.payload`,
                            lastModifiedTime: sql`excluded.last_modified_time`,
                            deletedAt: null,
                            updatedAt: now,
                        },
                    })
                    .returning()
                storedRows.push(...returned)
            }

            if (deletedInputs.length) {
                const now = new Date()
                const returned = await transaction
                    .insert(healthRecords)
                    .values(
                        deletedInputs.map(input => ({
                            userId: 'owner',
                            connector: input.provider,
                            provider: input.dataOrigin ?? input.provider,
                            recordType: input.recordType,
                            externalId: input.externalId,
                            externalVersion: input.externalVersion,
                            startTime: new Date(input.startTime),
                            endTime: input.endTime ? new Date(input.endTime) : null,
                            dataOrigin: input.dataOrigin,
                            recordingMethod: input.recordingMethod,
                            device: input.device ?? {},
                            payload: input.payload,
                            lastModifiedTime: input.lastModifiedTime
                                ? new Date(input.lastModifiedTime)
                                : undefined,
                            deletedAt: now,
                        })),
                    )
                    .onConflictDoUpdate({
                        target: [
                            healthRecords.userId,
                            healthRecords.connector,
                            healthRecords.externalId,
                        ],
                        setWhere: lt(healthRecords.externalVersion, sql`excluded.external_version`),
                        set: {
                            externalVersion: sql`excluded.external_version`,
                            deletedAt: now,
                            updatedAt: now,
                        },
                    })
                    .returning()
                storedRows.push(...returned)
            }
            const writeMs = durationMs(writeStartedAt)

            const projectionStartedAt = nowMs()
            const affectedDates = new Set<string>()
            const storedIds = storedRows.map(record => record.id)
            if (storedIds.length) {
                const previousProjections = await transaction
                    .select({
                        sourceRecordId: observations.sourceRecordId,
                        observedAt: observations.observedAt,
                        endedAt: observations.endedAt,
                    })
                    .from(observations)
                    .where(inArray(observations.sourceRecordId, storedIds))
                for (const projection of previousProjections) {
                    affectedDates.add(calendarDateKey(projection.observedAt, timezone))
                    if (projection.endedAt)
                        affectedDates.add(calendarDateKey(projection.endedAt, timezone))
                }
                await transaction
                    .delete(observations)
                    .where(inArray(observations.sourceRecordId, storedIds))
            }

            const inputByIdentity = new Map(
                changedInputs.map(input => [identity(input.provider, input.externalId), input]),
            )
            const canonicalRecords: CanonicalHealthRecord[] = storedRows
                .filter(record => !record.deletedAt)
                .map(record => {
                    const input = inputByIdentity.get(
                        identity(record.connector, record.externalId),
                    )!
                    return {
                        ...input,
                        id: record.id,
                        userId: record.userId,
                        connector: record.connector,
                        provider: record.provider,
                        startTime: record.startTime,
                        endTime: record.endTime,
                    }
                })
            const projectionResults = await insertHealthObservationGraphs(
                transaction,
                canonicalRecords,
            )
            for (const result of projectionResults) {
                for (const projection of result.projections) {
                    if (projection.observedAt)
                        affectedDates.add(calendarDateKey(projection.observedAt, timezone))
                    if (projection.endedAt)
                        affectedDates.add(calendarDateKey(projection.endedAt, timezone))
                }
            }
            await markProjectionDatesDirty(transaction, expandedDirtyDates(affectedDates))
            const projectionMs = durationMs(projectionStartedAt)

            await transaction.insert(deviceUploadBatches).values({
                deviceId,
                idempotencyKey,
                recordCount: records.length,
            })

            return {
                result: { duplicate: false, accepted: records.length },
                affectedDates,
                timings: {
                    normalizeMs,
                    preloadMs,
                    writeMs,
                    projectionMs,
                    received: records.length,
                    changed: storedRows.length,
                    skipped: records.length - storedRows.length,
                },
            }
        })
    }

    override async rebuildHealthRecordObservations() {
        const result = await super.rebuildHealthRecordObservations()
        await this.projections.invalidateCarryForwardDependents()
        return result
    }

    override async reconcileHealthRecords(
        deviceId: string,
        recordType: string,
        since: string,
        presentExternalIds: string[],
    ) {
        const present = new Set(presentExternalIds)
        const outcome = await this.database.transaction(async transaction => {
            const candidates = await transaction
                .select()
                .from(healthRecords)
                .where(
                    and(
                        eq(healthRecords.userId, 'owner'),
                        eq(healthRecords.connector, 'health_connect'),
                        eq(healthRecords.recordType, recordType),
                        gte(healthRecords.startTime, new Date(since)),
                        isNull(healthRecords.deletedAt),
                    ),
                )
            const stale = candidates.filter(record => !present.has(record.externalId))
            if (!stale.length)
                return {
                    result: { reconciled: 0, deviceId },
                    affectedDates: new Set<string>(),
                }

            const [saved] = await transaction
                .select({ timezone: preferences.timezone })
                .from(preferences)
                .where(eq(preferences.id, 'owner'))
            const timezone = saved?.timezone ?? 'UTC'
            const dates = new Set<string>()
            const staleIds = stale.map(record => record.id)

            for (const idBatch of chunks(staleIds)) {
                const prior = await transaction
                    .select({ observedAt: observations.observedAt, endedAt: observations.endedAt })
                    .from(observations)
                    .where(inArray(observations.sourceRecordId, idBatch))
                for (const item of prior) {
                    dates.add(calendarDateKey(item.observedAt, timezone))
                    if (item.endedAt) dates.add(calendarDateKey(item.endedAt, timezone))
                }
                const now = new Date()
                await transaction
                    .update(healthRecords)
                    .set({
                        externalVersion: deletionTombstoneVersion,
                        deletedAt: now,
                        updatedAt: now,
                    })
                    .where(inArray(healthRecords.id, idBatch))
                await transaction
                    .delete(observations)
                    .where(inArray(observations.sourceRecordId, idBatch))
            }

            await markProjectionDatesDirty(transaction, expandedDirtyDates(dates))
            return {
                result: { reconciled: stale.length, deviceId },
                affectedDates: dates,
            }
        })

        if (outcome.affectedDates.size)
            await this.projections.invalidateCarryForwardDependents(outcome.affectedDates)
        return outcome.result
    }
}
