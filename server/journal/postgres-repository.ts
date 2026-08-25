import { and, desc, eq, gte, isNull, lt, notExists, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { observationRelations, observations } from '../db/schema.js'
import type { JournalEntry, JournalListQuery, JournalRepository } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

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

const toEntry = (row: typeof observations.$inferSelect): JournalEntry => {
    const attributes = row.attributes as Record<string, unknown>
    const detail =
        typeof attributes.journalDetail === 'string'
            ? attributes.journalDetail
            : (row.textValue ??
              (row.valueType === 'number' && row.canonicalValue !== null
                  ? `${row.canonicalValue} ${row.canonicalUnit ?? ''}`.trim()
                  : ''))
    return {
        id: row.id,
        category: (row.category ?? 'Check-ins') as JournalEntry['category'],
        title: row.title ?? row.metric.replaceAll('_', ' '),
        detail,
        source: sourceLabel(row),
        observedAt: row.observedAt.toISOString(),
        externalId: row.externalId ?? undefined,
        version: Number(row.version),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        entityType: row.definitionId === 'meal' ? 'meal' : 'observation',
        entityId: row.id,
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
        const conditions = [
            isNull(observations.deletedAt),
            sql`${observations.category} is not null`,
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
        return rows.map(toEntry).filter(entry => !filters.source || entry.source === filters.source)
    }

    async ready() {
        await this.database.select({ id: observations.id }).from(observations).limit(1)
        return true
    }
}
