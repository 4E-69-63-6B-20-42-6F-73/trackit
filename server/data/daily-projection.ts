import { and, eq, gte, isNull, lt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { dailyMetrics, observations, preferences } from '../db/schema.js'
import { effectiveMetricSeries } from '../../src/domain/effectiveMetrics.js'
import { aggregateDailyObservations, type Observation } from '../../src/domain/health.js'
import { metricDefinition } from '../../src/domain/metricCatalog.js'
import type { MetricPreferences } from '../../src/domain/metrics.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function rebuildEffectiveDailyMetric(
    database: Database | Transaction,
    date: string,
) {
    const from = new Date(`${date}T00:00:00.000Z`)
    const to = new Date(from.getTime() + 86_400_000)
    const [records, saved] = await Promise.all([
        database
            .select()
            .from(observations)
            .where(
                and(
                    eq(observations.userId, 'owner'),
                    isNull(observations.deletedAt),
                    gte(observations.observedAt, from),
                    lt(observations.observedAt, to),
                ),
            ),
        database
            .select({ metricPreferences: preferences.metricPreferences })
            .from(preferences)
            .where(eq(preferences.id, 'owner')),
    ])
    const normalized = records.map(record => ({
        ...record,
        observedAt: record.observedAt.toISOString(),
        endedAt: record.endedAt?.toISOString() ?? null,
        metadata: record.metadata as Record<string, unknown>,
        version: Number(record.version),
    })) as Observation[]
    const effective = effectiveMetricSeries(
        normalized,
        (saved[0]?.metricPreferences ?? undefined) as MetricPreferences | undefined,
    )

    await database
        .delete(dailyMetrics)
        .where(and(eq(dailyMetrics.userId, 'owner'), eq(dailyMetrics.date, date)))
    const byMetric = new Map<string, Observation[]>()
    for (const record of effective)
        byMetric.set(record.metric, [...(byMetric.get(record.metric) ?? []), record])
    for (const [metric, values] of byMetric) {
        const definition = metricDefinition(metric)
        const value = aggregateDailyObservations(values)
        if (!definition || value === null) continue
        await database.insert(dailyMetrics).values({
            userId: 'owner',
            date,
            metric,
            value,
            unit: definition.canonicalUnit,
            derivationVersion: Math.max(...values.map(record => record.version)),
        })
    }
}
