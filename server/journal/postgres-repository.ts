import { and, desc, eq, gte, inArray, isNull, lt, notExists, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { healthRecords, observationRelations, observations, preferences } from '../db/schema.js'
import { metricDefinition } from '../../src/domain/metricCatalog.js'
import type {
    JournalEntry,
    JournalListQuery,
    JournalRepository,
    SleepStageDetail,
} from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

type HealthRecord = typeof healthRecords.$inferSelect

const sourceLabel = (row: typeof observations.$inferSelect) => {
    const attributes = row.attributes as Record<string, unknown>
    const metadata = row.metadata as Record<string, unknown>
    return typeof attributes.sourceLabel === 'string'
        ? attributes.sourceLabel
        : typeof metadata.dataOrigin === 'string'
          ? metadata.dataOrigin
          : row.origin === 'external'
            ? 'Imported'
            : row.origin === 'derived'
              ? 'TrackIt'
              : 'You'
}

const sleepStages = (record?: HealthRecord): SleepStageDetail[] => {
    if (!record || record.recordType !== 'SleepSessionRecord') return []
    const payload = record.payload as Record<string, unknown>
    const stages = Array.isArray(payload.stages) ? payload.stages : []
    return stages.flatMap(stage => {
        if (!stage || typeof stage !== 'object') return []
        const item = stage as Record<string, unknown>
        if (
            typeof item.type !== 'string' ||
            typeof item.start !== 'string' ||
            typeof item.end !== 'string'
        )
            return []
        const normalized = item.type.toLowerCase()
        const type: SleepStageDetail['type'] = ['awake', 'rem', 'light', 'deep'].includes(
            normalized,
        )
            ? (normalized as SleepStageDetail['type'])
            : 'unknown'
        return [{ type, start: item.start, end: item.end }]
    })
}

const toEntry = (
    row: typeof observations.$inferSelect,
    sourceRecord?: HealthRecord,
): JournalEntry => {
    const attributes = row.attributes as Record<string, unknown>
    const primaryDefinitionId =
        typeof attributes.primaryDefinitionId === 'string'
            ? attributes.primaryDefinitionId
            : row.definitionId
    const metricCategory = metricDefinition(primaryDefinitionId)?.category
    const projectedCategory =
        metricCategory === 'Activity'
            ? 'Activity'
            : metricCategory === 'Sleep'
              ? 'Sleep'
              : metricCategory === 'Nutrition'
                ? 'Meals'
                : 'Measurements'
    const detail =
        typeof attributes.description === 'string'
            ? attributes.description
            : (row.textValue ??
              (row.valueType === 'number' && row.canonicalValue !== null
                  ? `${row.canonicalValue} ${row.canonicalUnit ?? ''}`.trim()
                  : ''))
    const stages = sleepStages(sourceRecord)
    return {
        id: row.id,
        definitionId: primaryDefinitionId,
        category: (row.category ?? projectedCategory) as JournalEntry['category'],
        title: row.title ?? row.definitionId.replaceAll('_', ' '),
        detail,
        source: sourceLabel(row),
        observedAt: row.observedAt.toISOString(),
        startedAt: sourceRecord?.startTime.toISOString() ?? row.observedAt.toISOString(),
        endedAt: sourceRecord?.endTime?.toISOString() ?? row.endedAt?.toISOString(),
        externalId: row.externalId ?? undefined,
        version: Number(row.version),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        entityType: row.definitionId === 'meal' ? 'meal' : 'observation',
        entityId: row.id,
        detailView: stages.length ? { kind: 'sleep', stages } : undefined,
    }
}

export class PostgresJournalRepository implements JournalRepository {
    constructor(private readonly database: Database) {}

    async list(filters: JournalListQuery = {}) {
        const component = this.database
            .select({ id: observationRelations.childObservationId })
            .from(observationRelations)
            .where(
                and(
                    eq(observationRelations.childObservationId, observations.id),
                    eq(observationRelations.kind, 'component'),
                ),
            )
        const preference = sql<string | null>`(
            SELECT ${preferences.metricPreferences}
                -> COALESCE(${observations.attributes}->>'primaryDefinitionId', ${observations.definitionId})
                ->> 'showInJournal'
            FROM ${preferences}
            WHERE ${preferences.id} = 'owner'
        )`
        const visible = sql`(
            (${observations.category} IS NOT NULL AND COALESCE(${preference}, 'true') <> 'false')
            OR ${preference} = 'true'
        )`
        const conditions = [
            isNull(observations.deletedAt),
            visible,
            notExists(component),
            ...(filters.from ? [gte(observations.observedAt, new Date(filters.from))] : []),
            ...(filters.to ? [lt(observations.observedAt, new Date(filters.to))] : []),
            ...(filters.before ? [lt(observations.observedAt, new Date(filters.before))] : []),
            ...(filters.category ? [eq(observations.category, filters.category)] : []),
        ]
        const rows = await this.database
            .select()
            .from(observations)
            .where(and(...conditions))
            .orderBy(desc(observations.observedAt))
            .limit(Math.min(filters.limit ?? 100, 100))
        const sourceRecordIds = [
            ...new Set(rows.flatMap(row => (row.sourceRecordId ? [row.sourceRecordId] : []))),
        ]
        const sourceRecords = sourceRecordIds.length
            ? await this.database
                  .select()
                  .from(healthRecords)
                  .where(inArray(healthRecords.id, sourceRecordIds))
            : []
        const sourceRecordById = new Map(sourceRecords.map(record => [record.id, record]))
        return rows
            .map(row =>
                toEntry(
                    row,
                    row.sourceRecordId ? sourceRecordById.get(row.sourceRecordId) : undefined,
                ),
            )
            .filter(entry => !filters.source || entry.source === filters.source)
    }

    async ready() {
        await this.database.select({ id: observations.id }).from(observations).limit(1)
        return true
    }
}
