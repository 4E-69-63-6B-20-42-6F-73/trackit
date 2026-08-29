import { and, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { observations } from '../db/schema.js'
import type { RecordRange } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

export type MetricCoverage = {
    definitionId: string
    recordCount: number
    availableFrom: string
    availableTo: string
    sources: string[]
}

const rangeConditions = (range: RecordRange) => {
    const conditions: SQL[] = [
        isNull(observations.deletedAt),
        eq(observations.valueType, 'number'),
        isNotNull(observations.canonicalValue),
        isNotNull(observations.canonicalUnit),
        eq(observations.excluded, false),
    ]
    if (range.from) conditions.push(gte(observations.observedAt, new Date(range.from)))
    if (range.to) conditions.push(lt(observations.observedAt, new Date(range.to)))
    return conditions
}

const asIso = (value: Date | string) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString()

export async function listMetricCoverage(database: Database, range: RecordRange = {}) {
    const conditions = rangeConditions(range)
    const provider = sql<string>`coalesce(
        nullif(${observations.metadata}->>'dataOrigin', ''),
        nullif(${observations.metadata}->>'source', ''),
        'Manual'
    )`
    const connector = sql<string | null>`coalesce(
        nullif(${observations.metadata}->>'connector', ''),
        case
            when ${observations.metadata}->>'source' = 'Health Connect' then 'Health Connect'
            else null
        end
    )`
    const [coverageRows, sourceRows] = await Promise.all([
        database
            .select({
                definitionId: observations.definitionId,
                recordCount: sql<number>`count(*)::int`,
                availableFrom: sql<Date>`min(${observations.observedAt})`,
                availableTo: sql<Date>`max(${observations.observedAt})`,
            })
            .from(observations)
            .where(and(...conditions))
            .groupBy(observations.definitionId)
            .orderBy(observations.definitionId),
        database
            .selectDistinct({ definitionId: observations.definitionId, provider, connector })
            .from(observations)
            .where(and(...conditions))
            .orderBy(observations.definitionId, provider, connector),
    ])
    const sources = new Map<string, Set<string>>()
    for (const row of sourceRows) {
        const values = sources.get(row.definitionId) ?? new Set<string>()
        values.add(row.provider)
        if (row.connector) values.add(row.connector)
        sources.set(row.definitionId, values)
    }
    return coverageRows.map(
        (row): MetricCoverage => ({
            definitionId: row.definitionId,
            recordCount: Number(row.recordCount),
            availableFrom: asIso(row.availableFrom),
            availableTo: asIso(row.availableTo),
            sources: [...(sources.get(row.definitionId) ?? [])].sort(),
        }),
    )
}
