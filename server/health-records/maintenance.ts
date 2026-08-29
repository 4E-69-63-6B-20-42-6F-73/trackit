import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { healthRecords, observationRelations, observations, preferences } from '../db/schema.js'
import {
    resolveMaintenanceDateRange,
    type ProviderRecordMaintenanceRange,
} from '../data/maintenance-range.js'
import { markProjectionDatesDirty } from '../data/projection-state.js'
import { dateKeyInTimezone, localDayRange, nextDate } from '../data/timezone.js'
import { deriveRecord } from './derive.js'
import { projectHealthRecordToJournal } from './journal.js'
import { normalizeHealthRecord } from './normalize.js'
import type { CanonicalHealthRecord } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const previousDate = (date: string) => {
    const value = new Date(`${date}T00:00:00.000Z`)
    value.setUTCDate(value.getUTCDate() - 1)
    return value.toISOString().slice(0, 10)
}

const connectorLabel = (connector?: string) => {
    if (!connector || connector === 'health_connect') return 'Health Connect'
    return connector
}

async function insertObservationGraph(transaction: Transaction, record: CanonicalHealthRecord) {
    record = normalizeHealthRecord(record)
    const connector = connectorLabel(record.connector)
    const derived = deriveRecord(record)
    const components = derived.length
        ? await transaction
              .insert(observations)
              .values(
                  derived.map(projection => ({
                      userId: record.userId,
                      definitionId: projection.definitionId,
                      valueType: 'number' as const,
                      origin: 'external' as const,
                      canonicalValue: projection.value,
                      canonicalUnit: projection.unit,
                      originalValue: projection.value,
                      originalUnit: projection.unit,
                      observedAt: projection.observedAt!,
                      endedAt: projection.endedAt,
                      externalId: `${record.externalId}:${projection.definitionId}:v${projection.derivationVersion}`,
                      kind: projection.kind,
                      sourceRecordId: record.id,
                      derivation: projection.derivation,
                      derivationVersion: projection.derivationVersion,
                      version: record.externalVersion,
                      metadata: {
                          source: connector,
                          dataOrigin: record.dataOrigin,
                          connector,
                          provider: record.provider,
                      },
                  })),
              )
              .returning({ id: observations.id, definitionId: observations.definitionId })
        : []

    const journal = projectHealthRecordToJournal(record, derived)
    const observedAt =
        record.recordType === 'SleepSessionRecord' && record.endTime
            ? record.endTime
            : record.startTime
    const [root] = await transaction
        .insert(observations)
        .values({
            id: record.id,
            userId: record.userId,
            definitionId: 'health_record',
            valueType: 'compound',
            origin: 'external',
            title: journal?.title,
            category: journal?.category,
            observedAt,
            endedAt: record.endTime,
            sourceRecordId: record.id,
            externalId: record.externalId,
            attributes: {
                description: journal?.detail ?? '',
                primaryDefinitionId: derived[0]?.definitionId,
                sourceLabel: record.dataOrigin ? `${connector} · ${record.dataOrigin}` : connector,
                recordType: record.recordType,
            },
            metadata: {
                connector,
                provider: record.provider,
                dataOrigin: record.dataOrigin,
            },
            version: record.externalVersion,
        })
        .returning({ id: observations.id })

    if (root && components.length)
        await transaction.insert(observationRelations).values(
            components.map((component, ordinal) => ({
                parentObservationId: root.id,
                childObservationId: component.id,
                kind: 'component',
                role: component.definitionId,
                ordinal,
            })),
        )

    return { derived, observationCount: derived.length + 1 }
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
                        const result = await insertObservationGraph(transaction, record)
                        canonicalObservations += result.observationCount
                        for (const projection of result.derived) {
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
