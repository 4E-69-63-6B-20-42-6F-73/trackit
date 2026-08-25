import { and, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { meals, observations, preferences } from '../db/schema.js'
import { effectiveMetricSeries, mealMetricObservations } from '../../src/domain/effectiveMetrics.js'
import type { Observation } from '../../src/domain/health.js'
import type { MetricPreferences } from '../../src/domain/metrics.js'
import type { RecordRange } from './types.js'
import { metricDefinition } from '../../src/domain/metricCatalog.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function getEffectiveMetricSeries(
    database: Database | Transaction,
    range: RecordRange = {},
) {
    const observationConditions = [isNull(observations.deletedAt)]
    const mealConditions = [isNull(meals.deletedAt)]
    const requestedMetrics = range.metrics?.length ? new Set(range.metrics) : null
    const expandedMetrics = requestedMetrics
        ? new Set(
              [...requestedMetrics].flatMap(metric => [
                  metric,
                  ...(metricDefinition(metric)?.derived?.inputs ?? []),
              ]),
          )
        : null
    if (expandedMetrics?.size)
        observationConditions.push(inArray(observations.metric, [...expandedMetrics]))
    if (range.from) {
        const from = new Date(range.from)
        observationConditions.push(gte(observations.observedAt, from))
        mealConditions.push(gte(meals.eatenAt, from))
    }
    if (range.to) {
        const to = new Date(range.to)
        observationConditions.push(lt(observations.observedAt, to))
        mealConditions.push(lt(meals.eatenAt, to))
    }
    const needsHeight = !expandedMetrics || expandedMetrics.has('bmi')
    const needsMeals =
        !expandedMetrics ||
        [...expandedMetrics].some(metric => metricDefinition(metric)?.source === 'meal')
    const priorHeightQuery =
        range.from && needsHeight
            ? database
                  .select()
                  .from(observations)
                  .where(
                      and(
                          isNull(observations.deletedAt),
                          eq(observations.metric, 'height'),
                          lt(observations.observedAt, new Date(range.from)),
                      ),
                  )
                  .orderBy(desc(observations.observedAt))
                  .limit(100)
            : Promise.resolve([])
    const [records, mealRecords, priorHeights, saved] = await Promise.all([
        database
            .select()
            .from(observations)
            .where(and(...observationConditions)),
        needsMeals
            ? database
                  .select()
                  .from(meals)
                  .where(and(...mealConditions))
            : Promise.resolve([]),
        priorHeightQuery,
        database
            .select({ metricPreferences: preferences.metricPreferences })
            .from(preferences)
            .where(eq(preferences.id, 'owner')),
    ])
    const normalize = (record: (typeof records)[number]): Observation => ({
        ...record,
        observedAt: record.observedAt.toISOString(),
        endedAt: record.endedAt?.toISOString() ?? null,
        metadata: record.metadata as Record<string, unknown>,
        version: Number(record.version),
    })
    const effective = effectiveMetricSeries(
        [
            ...priorHeights.map(normalize),
            ...records.map(normalize),
            ...mealMetricObservations(
                mealRecords.map(meal => ({
                    id: meal.id,
                    eatenAt: meal.eatenAt.toISOString(),
                    nutrientSnapshot: meal.nutrientSnapshot as Record<string, number | undefined>,
                    version: meal.version,
                })),
            ),
        ],
        (saved[0]?.metricPreferences ?? undefined) as MetricPreferences | undefined,
    )
    return effective.filter(record => {
        const observedAt = new Date(record.observedAt)
        return (
            (!requestedMetrics || requestedMetrics.has(record.metric)) &&
            (!range.from || observedAt >= new Date(range.from)) &&
            (!range.to || observedAt < new Date(range.to))
        )
    })
}
