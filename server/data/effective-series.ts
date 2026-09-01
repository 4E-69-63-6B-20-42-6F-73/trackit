import { and, desc, eq, gte, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
    effectiveBaseMetricSeries,
    effectiveMetricSeriesInTimezone,
} from '@trackit/domain/effectiveMetrics'
import type { NumericObservation } from '@trackit/domain/health'
import type { MetricPreferences } from '@trackit/domain/metrics'
import { metricDefinition } from '@trackit/domain/metricCatalog'
import type * as schemaType from '../db/schema.js'
import {
    dailyProjectionRuns,
    derivedObservationInputs,
    derivedObservations,
    observations,
    preferences,
    projectionDirtyDates,
} from '../db/schema.js'
import type { RecordRange } from './types.js'
import { DERIVED_OBSERVATION_CACHE_VERSION } from './derived-observation-cache.js'
import { dateKeyInTimezone, datesThrough } from './timezone.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

async function cachedDerivedSeries(
    database: Database | Transaction,
    range: RecordRange,
    requestedMetrics: Set<string> | null,
    resolutionVersion: number,
    timezone: string,
): Promise<NumericObservation[] | null> {
    if (
        !requestedMetrics?.size ||
        !range.from ||
        !range.to ||
        [...requestedMetrics].some(metric => !metricDefinition(metric)?.derived)
    )
        return null
    const from = new Date(range.from)
    const to = new Date(range.to)
    if (!(from < to)) return []
    const finalInstant = new Date(to.getTime() - 1)
    const dates = datesThrough(
        dateKeyInTimezone(from, timezone),
        dateKeyInTimezone(finalInstant, timezone),
    )
    const [runs, dirty] = await Promise.all([
        database
            .select()
            .from(dailyProjectionRuns)
            .where(
                and(
                    eq(dailyProjectionRuns.userId, 'owner'),
                    inArray(dailyProjectionRuns.date, dates),
                    eq(dailyProjectionRuns.derivationVersion, 2),
                    eq(dailyProjectionRuns.resolutionVersion, resolutionVersion),
                    eq(dailyProjectionRuns.timezone, timezone),
                    eq(dailyProjectionRuns.status, 'complete'),
                ),
            ),
        database
            .select({ date: projectionDirtyDates.date })
            .from(projectionDirtyDates)
            .where(
                and(
                    eq(projectionDirtyDates.userId, 'owner'),
                    inArray(projectionDirtyDates.date, dates),
                ),
            ),
    ])
    if (dirty.length || new Set(runs.map(run => run.date)).size !== dates.length) return null
    const cached = await database
        .select()
        .from(derivedObservations)
        .where(
            and(
                eq(derivedObservations.userId, 'owner'),
                inArray(derivedObservations.date, dates),
                inArray(derivedObservations.definitionId, [...requestedMetrics]),
                eq(derivedObservations.derivationVersion, DERIVED_OBSERVATION_CACHE_VERSION),
                eq(derivedObservations.resolutionVersion, resolutionVersion),
                eq(derivedObservations.timezone, timezone),
            ),
        )
    const lineage = cached.length
        ? await database
              .select()
              .from(derivedObservationInputs)
              .where(
                  inArray(
                      derivedObservationInputs.derivedObservationId,
                      cached.map(row => row.id),
                  ),
              )
        : []
    const lineageByDerived = new Map<string, string[]>()
    for (const input of lineage)
        lineageByDerived.set(input.derivedObservationId, [
            ...(lineageByDerived.get(input.derivedObservationId) ?? []),
            input.inputObservationId,
        ])
    return cached
        .map((row): NumericObservation => ({
            id: row.id,
            definitionId: row.definitionId,
            canonicalValue: row.canonicalValue,
            canonicalUnit: row.canonicalUnit,
            originalValue: row.canonicalValue,
            originalUnit: row.canonicalUnit,
            observedAt: row.observedAt.toISOString(),
            endedAt: row.endedAt?.toISOString() ?? null,
            provider: 'TrackIt',
            connector: null,
            metadata: {
                derived: true,
                cached: true,
                inputRecordIds: lineageByDerived.get(row.id) ?? [],
                inputFingerprint: row.inputFingerprint,
            },
            excluded: false,
            version: row.derivationVersion,
        }))
        .filter(row => new Date(row.observedAt) >= from && new Date(row.observedAt) < to)
}

async function loadEffectiveMetricSeries(
    database: Database | Transaction,
    range: RecordRange = {},
    includeDerived = true,
) {
    const observationConditions = [
        isNull(observations.deletedAt),
        eq(observations.valueType, 'number'),
        isNotNull(observations.canonicalValue),
        isNotNull(observations.canonicalUnit),
        isNotNull(observations.originalValue),
        isNotNull(observations.originalUnit),
    ]
    const requestedMetrics = range.definitionIds?.length ? new Set(range.definitionIds) : null
    const [saved] = await database
        .select({
            metricPreferences: preferences.metricPreferences,
            metricResolutionVersion: preferences.metricResolutionVersion,
            timezone: preferences.timezone,
        })
        .from(preferences)
        .where(eq(preferences.id, 'owner'))
    if (includeDerived) {
        const cached = await cachedDerivedSeries(
            database,
            range,
            requestedMetrics,
            saved?.metricResolutionVersion ?? 1,
            saved?.timezone ?? 'UTC',
        )
        if (cached) return cached
    }
    const expandedMetrics = requestedMetrics
        ? new Set(
              [...requestedMetrics].flatMap(metric => [
                  metric,
                  ...(metricDefinition(metric)?.derived?.inputs ?? []),
              ]),
          )
        : null
    if (expandedMetrics?.size)
        observationConditions.push(inArray(observations.definitionId, [...expandedMetrics]))
    if (range.from) {
        const from = new Date(range.from)
        observationConditions.push(gte(observations.observedAt, from))
    }
    if (range.to) {
        const to = new Date(range.to)
        observationConditions.push(lt(observations.observedAt, to))
    }
    const needsHeight = !expandedMetrics || expandedMetrics.has('bmi')
    const priorHeightQuery =
        range.from && needsHeight
            ? database
                  .select()
                  .from(observations)
                  .where(
                      and(
                          isNull(observations.deletedAt),
                          eq(observations.definitionId, 'height'),
                          lt(observations.observedAt, new Date(range.from)),
                      ),
                  )
                  .orderBy(desc(observations.observedAt))
                  .limit(100)
            : Promise.resolve([])
    const [records, priorHeights] = await Promise.all([
        database
            .select()
            .from(observations)
            .where(and(...observationConditions)),
        priorHeightQuery,
    ])
    const normalize = (record: (typeof records)[number]): NumericObservation => ({
        ...record,
        canonicalValue: record.canonicalValue!,
        canonicalUnit: record.canonicalUnit!,
        originalValue: record.originalValue!,
        originalUnit: record.originalUnit!,
        observedAt: record.observedAt.toISOString(),
        endedAt: record.endedAt?.toISOString() ?? null,
        metadata: record.metadata as Record<string, unknown>,
        version: Number(record.version),
    })
    const candidates = [...priorHeights.map(normalize), ...records.map(normalize)]
    const metricPreferences = (saved?.metricPreferences ?? undefined) as
        MetricPreferences | undefined
    const effective = includeDerived
        ? effectiveMetricSeriesInTimezone(candidates, metricPreferences, saved?.timezone ?? 'UTC')
        : effectiveBaseMetricSeries(candidates, metricPreferences)
    return effective.filter(record => {
        const observedAt = new Date(record.observedAt)
        return (
            (!includeDerived && record.definitionId === 'height') ||
            ((!requestedMetrics || requestedMetrics.has(record.definitionId)) &&
                (!range.from || observedAt >= new Date(range.from)) &&
                (!range.to || observedAt < new Date(range.to)))
        )
    })
}

export function getEffectiveMetricSeries(
    database: Database | Transaction,
    range: RecordRange = {},
) {
    return loadEffectiveMetricSeries(database, range, true)
}

export function getEffectiveBaseMetricSeries(
    database: Database | Transaction,
    range: RecordRange = {},
) {
    return loadEffectiveMetricSeries(database, range, false)
}
