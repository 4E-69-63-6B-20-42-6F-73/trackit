import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { healthRecords, observations, preferences } from '../db/schema.js'
import {
    resolveMaintenanceDateRange,
    type ProviderRecordMaintenanceRange,
} from '../data/maintenance-range.js'
import { markProjectionDatesDirty } from '../data/projection-state.js'
import { dateKeyInTimezone, localDayRange, nextDate } from '../data/timezone.js'
import { normalizeHealthRecord } from './normalize.js'
import { insertHealthObservationGraph } from './projection.js'

type Database = PostgresJsDatabase<typeof schemaType>

const previousDate = (date: string) => {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() - 1)
    return value.toISOString().slice(0, 10)
}

export class ProviderRecordMaintenanceService {
    constructor(private readonly database: Database) {}

    async rederive(input: ProviderRecordMaintenanceRange = {}) {
        const [saved] = await this.database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const timezone = saved?.timezone ?? 'UTC'
        const range = resolveMaintenanceDateRange(input, timezone)
        const from = range.from ? localDayRange(range.from, timezone).from : undefined
        const to = range.to ? localDayRange(range.to, timezone).to : undefined

        const batchSize = 25
        let cursor: string | undefined
        let sourceRecords = 0
        let canonicalObservations = 0
        const dirtyDates = new Set<string>()

        while (true) {
            const conditions: SQL[] = []
            if (cursor) conditions.push(gt(healthRecords.id, cursor))
            if (to) conditions.push(lt(healthRecords.startTime, to))
            if (from)
                conditions.push(
                    sql`coalesce(${healthRecords.endTime}, ${healthRecords.startTime}) >= ${from.toISOString()}::timestamptz`,
                )
            if (input.recordTypes?.length)
                conditions.push(inArray(healthRecords.recordType, input.recordTypes))

            const records = await this.database
                .select()
                .from(healthRecords)
                .where(conditions.length ? and(...conditions) : undefined)
                .orderBy(healthRecords.id)
                .limit(batchSize)
            if (!records.length) break

            await this.database.transaction(async transaction => {
                for (const stored of records) {
                    const previous = await transaction
                        .select({
                            observedAt: observations.observedAt,
                            endedAt: observations.endedAt,
                        })
                        .from(observations)
                        .where(eq(observations.sourceRecordId, stored.id))
                    for (const item of previous) {
                        dirtyDates.add(dateKeyInTimezone(item.observedAt, timezone))
                        if (item.endedAt) dirtyDates.add(dateKeyInTimezone(item.endedAt, timezone))
                    }

                    await transaction
                        .delete(observations)
                        .where(eq(observations.sourceRecordId, stored.id))

                    dirtyDates.add(dateKeyInTimezone(stored.startTime, timezone))
                    if (stored.endTime) dirtyDates.add(dateKeyInTimezone(stored.endTime, timezone))

                    if (!stored.deletedAt) {
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
                        canonicalObservations += projections.length + 1
                        for (const projection of projections) {
                            if (projection.observedAt)
                                dirtyDates.add(dateKeyInTimezone(projection.observedAt, timezone))
                            if (projection.endedAt)
                                dirtyDates.add(dateKeyInTimezone(projection.endedAt, timezone))
                        }
                    }
                }
            })

            sourceRecords += records.length
            cursor = records.at(-1)!.id
        }

        const expandedDates = new Set<string>()
        for (const date of dirtyDates) {
            expandedDates.add(previousDate(date))
            expandedDates.add(date)
            expandedDates.add(nextDate(date))
        }
        await markProjectionDatesDirty(this.database, expandedDates)

        return {
            sourceRecords,
            canonicalObservations,
            queuedProjectionDates: expandedDates.size,
        }
    }
}