import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
    aggregateDailyObservations,
    dailyMetricAttributionInstant,
    type NumericObservation,
} from '@trackit/domain/health'
import { effectiveMetricSeriesInTimezone } from '@trackit/domain/effectiveMetrics'
import type { MetricPreferences } from '@trackit/domain/metrics'
import { metricDefinition } from '@trackit/domain/metricCatalog'
import type * as schemaType from '../db/schema.js'
import {
    dailyMetrics,
    dailyProjectionRuns,
    preferences,
    projectionDirtyDates,
} from '../db/schema.js'
import { dateKeyInTimezone, localDayRange } from './timezone.js'
import { getEffectiveBaseMetricSeries } from './effective-series.js'
import { replaceDerivedObservationCache } from './derived-observation-cache.js'

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
    // Sleep belongs to its wake day, while additive intervals intentionally belong to
    // their start day. Load enough look-behind to retain overnight source intervals.
    const candidates = await getEffectiveBaseMetricSeries(database, {
        from: new Date(from.getTime() - 36 * 60 * 60 * 1000).toISOString(),
        to: to.toISOString(),
    })
    const attributedInputs = candidates.filter(
        record => dateKeyInTimezone(dailyMetricAttributionInstant(record), timezone) === date,
    )
    const priorHeight = candidates
        .filter(record => record.definitionId === 'height' && new Date(record.observedAt) < to)
        .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]
    const inputs =
        priorHeight && !attributedInputs.some(record => record.id === priorHeight.id)
            ? [...attributedInputs, priorHeight]
            : attributedInputs
    const resolved = effectiveMetricSeriesInTimezone(
        inputs,
        (saved?.metricPreferences ?? undefined) as MetricPreferences | undefined,
        timezone,
    )
    const effective = resolved.filter(
        record =>
            record.metadata?.derived === true ||
            attributedInputs.some(input => input.id === record.id),
    )

    await replaceDerivedObservationCache(database, {
        userId: 'owner',
        date,
        timezone,
        resolutionVersion: saved?.metricResolutionVersion ?? 1,
        inputs,
    })

    await database
        .delete(dailyMetrics)
        .where(and(eq(dailyMetrics.userId, 'owner'), eq(dailyMetrics.date, date)))
    const byMetric = new Map<string, NumericObservation[]>()
    for (const record of effective)
        byMetric.set(record.definitionId, [...(byMetric.get(record.definitionId) ?? []), record])
    for (const [metric, values] of byMetric) {
        const definition = metricDefinition(metric)
        const value = aggregateDailyObservations(values)
        if (!definition || value === null) continue
        await database.insert(dailyMetrics).values({
            userId: 'owner',
            date,
            definitionId: metric,
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
