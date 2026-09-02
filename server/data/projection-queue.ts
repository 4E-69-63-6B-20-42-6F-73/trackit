import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { projectionDirtyDates } from '../db/schema.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function markProjectionDirty(database: Database | Transaction, date: string) {
    await database
        .insert(projectionDirtyDates)
        .values({ userId: 'owner', date })
        .onConflictDoUpdate({
            target: [projectionDirtyDates.userId, projectionDirtyDates.date],
            set: { createdAt: new Date() },
        })
}

export async function markProjectionDatesDirty(
    database: Database | Transaction,
    dates: Iterable<string>,
) {
    const uniqueDates = [...new Set(dates)]
    if (!uniqueDates.length) return
    await database
        .insert(projectionDirtyDates)
        .values(uniqueDates.map(date => ({ userId: 'owner', date })))
        .onConflictDoUpdate({
            target: [projectionDirtyDates.userId, projectionDirtyDates.date],
            set: { createdAt: new Date() },
        })
}
