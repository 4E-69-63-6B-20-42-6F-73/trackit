import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { journalEntries } from '../db/schema.js'
import type {
    CreateJournalEntry,
    JournalEntityLink,
    JournalEntry,
    JournalListQuery,
    JournalRepository,
    UpdateJournalEntry,
} from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

const toEntry = (row: typeof journalEntries.$inferSelect): JournalEntry => ({
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
    entityType: row.entityType
        ? (row.entityType as 'meal' | 'observation' | 'health_record')
        : undefined,
    entityId: row.entityId ?? undefined,
})

export class PostgresJournalRepository implements JournalRepository {
    constructor(private readonly database: Database) {}

    async list(query: JournalListQuery = {}) {
        const conditions = [isNull(journalEntries.deletedAt)]
        if (query.from) conditions.push(gte(journalEntries.observedAt, new Date(query.from)))
        if (query.to) conditions.push(lte(journalEntries.observedAt, new Date(query.to)))
        const statement = this.database
            .select()
            .from(journalEntries)
            .where(and(...conditions))
            .orderBy(desc(journalEntries.observedAt))
        const rows = query.limit ? await statement.limit(query.limit) : await statement
        return rows.map(toEntry)
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
