import { and, desc, eq, gte, isNull, lt, lte } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { devices, journalEntries } from '../db/schema.js'
import type {
    CreateJournalEntry,
    JournalEntityLink,
    JournalEntry,
    JournalListQuery,
    JournalRepository,
    UpdateJournalEntry,
} from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

const toEntry = (
    row: typeof journalEntries.$inferSelect,
    deviceName?: string | null,
): JournalEntry => ({
    id: row.id,
    category: row.category,
    title: row.title,
    detail: row.detail,
    source: row.sourceLabel,
    observedAt: row.observedAt.toISOString(),
    externalId: row.externalId ?? undefined,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deviceName: deviceName ?? undefined,
    entityType: row.entityType
        ? (row.entityType as 'meal' | 'observation' | 'health_record')
        : undefined,
    entityId: row.entityId ?? undefined,
})

export class PostgresJournalRepository implements JournalRepository {
    constructor(private readonly database: Database) {}

    async list(filters: JournalListQuery = {}) {
        const conditions = [
            isNull(journalEntries.deletedAt),
            ...(filters.from ? [gte(journalEntries.observedAt, new Date(filters.from))] : []),
            ...(filters.to ? [lte(journalEntries.observedAt, new Date(filters.to))] : []),
            ...(filters.before ? [lt(journalEntries.observedAt, new Date(filters.before))] : []),
            ...(filters.category ? [eq(journalEntries.category, filters.category)] : []),
            ...(filters.source ? [eq(journalEntries.sourceLabel, filters.source)] : []),
        ]
        const rows = await this.database
            .select({ entry: journalEntries, deviceName: devices.name })
            .from(journalEntries)
            .leftJoin(devices, eq(journalEntries.sourceId, devices.id))
            .where(and(...conditions))
            .orderBy(desc(journalEntries.observedAt))
            .limit(Math.min(filters.limit ?? 100, 100))
        return rows.map(row => toEntry(row.entry, row.deviceName))
    }

    async create(input: CreateJournalEntry & JournalEntityLink) {
        const [row] = await this.database
            .insert(journalEntries)
            .values({
                id: input.id,
                category: input.category,
                title: input.title,
                detail: input.detail,
                sourceLabel: input.source,
                observedAt: new Date(input.observedAt),
                externalId: input.externalId,
                entityType: input.entityType,
                entityId: input.entityId,
            })
            .onConflictDoUpdate({
                target: journalEntries.id,
                set: {
                    title: input.title,
                    detail: input.detail,
                    updatedAt: new Date(),
                },
            })
            .returning()
        return toEntry(row)
    }

    async remove(id: string) {
        const rows = await this.database
            .update(journalEntries)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(journalEntries.id, id), isNull(journalEntries.deletedAt)))
            .returning({ id: journalEntries.id })
        return rows.length > 0
    }

    async update(id: string, input: UpdateJournalEntry) {
        const [row] = await this.database
            .update(journalEntries)
            .set({
                title: input.title,
                detail: input.detail,
                observedAt: input.observedAt ? new Date(input.observedAt) : undefined,
                version: input.version + 1,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(journalEntries.id, id),
                    eq(journalEntries.version, input.version),
                    isNull(journalEntries.deletedAt),
                ),
            )
            .returning()
        return row ? toEntry(row) : null
    }

    async ready() {
        await this.database.select({ id: journalEntries.id }).from(journalEntries).limit(1)
        return true
    }
}
