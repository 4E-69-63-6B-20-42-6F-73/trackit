import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    dailyMetrics,
    dailyProjectionRuns,
    preferences,
    projectionDirtyDates,
} from '../db/schema.js'
import { aggregateDailyObservations, type Observation } from '../../src/domain/health.js'
import { metricDefinition } from '../../src/domain/metricCatalog.js'
import { localDayRange } from './timezone.js'
import { getEffectiveMetricSeries } from './effective-series.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export const EFFECTIVE_DAILY_DERIVATION_VERSION = 2

export async function replaceEffectiveDailyMetric(database: Transaction, date: string) {
    const [saved] = await database
        .select({
            metricPreferences: preferences.metricPreferences,
            metricResolutionVersion: preferences.metricResolutionVersion,
            timezone: preferences.timezone,
        })
        .from(preferences)
        .where(eq(preferences.id, 'owner'))
    const timezone = saved?.timezone ?? 'UTC'
    const { from, to } = localDayRange(date, timezone)
    const effective = await getEffectiveMetricSeries(database, {
        from: from.toISOString(),
        to: to.toISOString(),
    })

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
            derivationVersion: EFFECTIVE_DAILY_DERIVATION_VERSION,
            resolutionVersion: saved?.metricResolutionVersion ?? 1,
            timezone,
        })
    }
    await database
        .insert(dailyProjectionRuns)
        .values({
            userId: 'owner',
            date,
            derivationVersion: EFFECTIVE_DAILY_DERIVATION_VERSION,
            resolutionVersion: saved?.metricResolutionVersion ?? 1,
            timezone,
            status: 'complete',
        })
        .onConflictDoUpdate({
            target: [dailyProjectionRuns.userId, dailyProjectionRuns.date],
            set: {
                derivationVersion: EFFECTIVE_DAILY_DERIVATION_VERSION,
                resolutionVersion: saved?.metricResolutionVersion ?? 1,
                timezone,
                status: 'complete',
                completedAt: new Date(),
                updatedAt: new Date(),
            },
        })
    await database
        .delete(projectionDirtyDates)
        .where(and(eq(projectionDirtyDates.userId, 'owner'), eq(projectionDirtyDates.date, date)))
}

export function rebuildEffectiveDailyMetric(database: Database, date: string) {
    return database.transaction(transaction => replaceEffectiveDailyMetric(transaction, date))
}
