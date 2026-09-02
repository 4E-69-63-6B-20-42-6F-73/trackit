import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { DataRepository, RecordRange } from '../data/types.js'
import type { MetricCoverage } from '../data/metric-coverage.js'
import {
    aggregateDailyObservations,
    dailyMetricAttributionInstant,
    type NumericObservation,
} from '@trackit/domain/health'
import { metricCatalog, metricDefinition } from '@trackit/domain/metricCatalog'
import type { McpClient } from './service.js'

type InsightGranularity = 'raw' | 'day' | 'week' | 'month'
type DailyInsightPoint = {
    period: string
    value: number | null
    coveredDays: number
    totalDays: number
}
type MeasurementInsightRepository = DataRepository & {
    listMetricCoverage?: (range?: RecordRange) => Promise<MetricCoverage[]>
}
type CatalogCoverage = {
    recordCount: number | null
    availableFrom: string | null
    availableTo: string | null
    sources: string[]
    coverageBasis: 'stored_records' | 'derived_from_inputs' | 'none'
}

const timestampSchema = z
    .string()
    .trim()
    .min(1)
    .refine(value => !Number.isNaN(new Date(value).valueOf()), 'Must be a valid date or timestamp')

const textResult = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
})

const denied = (reason: string) => ({
    isError: true,
    content: [{ type: 'text' as const, text: reason }],
})

const dateFormatter = (timezone: string) =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })

const enumerateDates = (from: string, to: string) => {
    const values: string[] = []
    const current = new Date(`${from}T00:00:00.000Z`)
    const end = new Date(`${to}T00:00:00.000Z`)
    while (current <= end) {
        values.push(current.toISOString().slice(0, 10))
        current.setUTCDate(current.getUTCDate() + 1)
    }
    return values
}

const isAdditive = (definitionId: string) =>
    Boolean(metricDefinition(definitionId)?.goalCapabilities?.aggregations.total)

const dailyAggregation = (definitionId: string) =>
    isAdditive(definitionId) ? 'sum' : (metricDefinition(definitionId)?.aggregations[0] ?? 'latest')

const periodAggregation = (definitionId: string) => (isAdditive(definitionId) ? 'sum' : 'average')

const sourceNames = (records: NumericObservation[], definitionId: string) => {
    const definition = metricDefinition(definitionId)
    const sources = [
        ...new Set(
            records
                .flatMap(record => [record.provider, record.connector])
                .filter((value): value is string => Boolean(value)),
        ),
    ].sort()
    return sources.length ? sources : definition ? [definition.source] : []
}

const resolveRange = (
    client: McpClient,
    input: { from?: string; to?: string },
    fallbackDays: number,
) => {
    const now = new Date()
    const grantTo = client.dateTo ? new Date(client.dateTo.getTime() + 1) : now
    const requestedTo = input.to ? new Date(input.to) : grantTo
    const to = new Date(Math.min(requestedTo.getTime(), grantTo.getTime(), now.getTime()))
    const fallbackFrom = new Date(to)
    fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - fallbackDays)
    const requestedFrom = input.from ? new Date(input.from) : fallbackFrom
    const from = new Date(
        Math.max(requestedFrom.getTime(), client.dateFrom?.getTime() ?? -Infinity),
    )
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to)
        return null
    return { from: from.toISOString(), to: to.toISOString() }
}

const groupDaily = (records: NumericObservation[], timezone: string, from: string, to: string) => {
    const formatter = dateFormatter(timezone)
    const first = formatter.format(new Date(from))
    const last = formatter.format(new Date(new Date(to).getTime() - 1))
    const buckets = new Map<string, NumericObservation[]>()
    for (const record of records.filter(record => !record.excluded)) {
        const day = formatter.format(dailyMetricAttributionInstant(record))
        buckets.set(day, [...(buckets.get(day) ?? []), record])
    }
    return enumerateDates(first, last).map(day => {
        const values = buckets.get(day) ?? []
        return {
            period: day,
            value: aggregateDailyObservations(values),
            coveredDays: values.length ? 1 : 0,
            totalDays: 1,
        }
    })
}

const combinePeriods = (
    definitionId: string,
    groups: Array<{ period: string; points: DailyInsightPoint[] }>,
) =>
    groups.map(group => {
        const covered = group.points.filter(
            (point): point is DailyInsightPoint & { value: number } => point.value !== null,
        )
        return {
            period: group.period,
            value: covered.length
                ? isAdditive(definitionId)
                    ? covered.reduce((sum, point) => sum + point.value, 0)
                    : covered.reduce((sum, point) => sum + point.value, 0) / covered.length
                : null,
            coveredDays: covered.reduce((sum, point) => sum + point.coveredDays, 0),
            totalDays: group.points.reduce((sum, point) => sum + point.totalDays, 0),
        }
    })

const weeklyPoints = (definitionId: string, daily: DailyInsightPoint[]) => {
    const groups = []
    for (let offset = 0; offset < daily.length; offset += 7) {
        const points = daily.slice(offset, offset + 7)
        groups.push({
            period:
                points.length > 1
                    ? `${points[0].period} – ${points.at(-1)!.period}`
                    : points[0].period,
            points,
        })
    }
    return combinePeriods(definitionId, groups)
}

const monthlyPoints = (definitionId: string, daily: DailyInsightPoint[]) => {
    const byMonth = new Map<string, DailyInsightPoint[]>()
    for (const point of daily) {
        const month = point.period.slice(0, 7)
        byMonth.set(month, [...(byMonth.get(month) ?? []), point])
    }
    return combinePeriods(
        definitionId,
        [...byMonth.entries()].map(([period, points]) => ({ period, points })),
    )
}

const observationSource = (record: NumericObservation) =>
    record.provider ?? record.connector ?? record.sourceId ?? null

const catalogCoverage = (
    definitionId: string,
    coverage: Map<string, MetricCoverage>,
): CatalogCoverage => {
    const direct = coverage.get(definitionId)
    if (direct) {
        return {
            recordCount: direct.recordCount,
            availableFrom: direct.availableFrom,
            availableTo: direct.availableTo,
            sources: direct.sources,
            coverageBasis: 'stored_records',
        }
    }
    const definition = metricDefinition(definitionId)
    if (!definition?.derived) {
        return {
            recordCount: 0,
            availableFrom: null,
            availableTo: null,
            sources: [],
            coverageBasis: 'none',
        }
    }
    const inputs = definition.derived.inputs.map(input => coverage.get(input))
    if (inputs.some(input => !input)) {
        return {
            recordCount: 0,
            availableFrom: null,
            availableTo: null,
            sources: [],
            coverageBasis: 'none',
        }
    }
    const resolved = inputs as MetricCoverage[]
    const availableFrom = resolved
        .map(input => input.availableFrom)
        .sort((left, right) => right.localeCompare(left))[0]
    const availableTo = resolved
        .map(input => input.availableTo)
        .sort((left, right) => left.localeCompare(right))[0]
    if (availableFrom > availableTo) {
        return {
            recordCount: 0,
            availableFrom: null,
            availableTo: null,
            sources: [],
            coverageBasis: 'none',
        }
    }
    return {
        recordCount: null,
        availableFrom,
        availableTo,
        sources: ['TrackIt'],
        coverageBasis: 'derived_from_inputs',
    }
}

export function registerMeasurementInsightTools(
    server: McpServer,
    client: McpClient,
    data: DataRepository,
) {
    const canReadMeasurements = () => client.scopes.includes('observations')
    const ownerTimezone = async () => {
        const preference = (await data.getPreferences()) as { timezone?: string }
        return preference.timezone || 'UTC'
    }

    server.registerTool(
        'get_metric_catalog',
        {
            description:
                'Discover TrackIt metrics available for analysis, including labels, units, aggregation semantics, coverage, and provenance.',
            inputSchema: {
                includeEmpty: z.boolean().default(false),
            },
        },
        async ({ includeEmpty }) => {
            if (!canReadMeasurements()) return denied('Measurement read permission is required.')
            const range = resolveRange(client, {}, 3650)
            if (!range) return denied('No date range is available within this assistant grant.')
            const insightData = data as MeasurementInsightRepository
            if (!insightData.listMetricCoverage)
                return denied('Metric catalog coverage is unavailable.')
            const [coverageRows, timezone] = await Promise.all([
                insightData.listMetricCoverage(range),
                ownerTimezone(),
            ])
            const coverage = new Map(coverageRows.map(row => [row.definitionId, row]))
            const metrics = metricCatalog
                .map(definition => {
                    const availability = catalogCoverage(definition.id, coverage)
                    return {
                        definitionId: definition.id,
                        label: definition.name,
                        category: definition.category,
                        unit: definition.canonicalUnit,
                        recordCount: availability.recordCount,
                        availableFrom: availability.availableFrom,
                        availableTo: availability.availableTo,
                        dailyAggregation: dailyAggregation(definition.id),
                        periodAggregation: periodAggregation(definition.id),
                        sources: availability.sources.length
                            ? availability.sources
                            : [definition.source],
                        coverageBasis: availability.coverageBasis,
                    }
                })
                .filter(metric => includeEmpty || metric.coverageBasis !== 'none')
            return textResult({
                metrics,
                metadata: {
                    timezone,
                    inspectedFrom: range.from,
                    inspectedTo: range.to,
                    grantedFrom: client.dateFrom?.toISOString() ?? null,
                    grantedTo: client.dateTo?.toISOString() ?? null,
                    provenance: 'TrackIt metric catalog and compact measurement coverage',
                    coverageNote:
                        'Stored metric coverage is summarized in PostgreSQL. Derived metric availability is inferred from input coverage.',
                },
            })
        },
    )

    server.registerTool(
        'query_measurements',
        {
            description:
                'Query one or more TrackIt metric series for analysis. TrackIt applies metric-specific aggregation semantics and reports missing coverage explicitly.',
            inputSchema: {
                definitionIds: z.array(z.string().trim().min(1).max(100)).min(1).max(12),
                from: timestampSchema.optional(),
                to: timestampSchema.optional(),
                granularity: z.enum(['raw', 'day', 'week', 'month']).default('day'),
            },
        },
        async ({ definitionIds, from, to, granularity }) => {
            if (!canReadMeasurements()) return denied('Measurement read permission is required.')
            const uniqueDefinitionIds = [...new Set(definitionIds)]
            const unknown = uniqueDefinitionIds.filter(id => !metricDefinition(id))
            if (unknown.length) return denied(`Unknown metric: ${unknown.join(', ')}`)
            const range = resolveRange(client, { from, to }, 90)
            if (!range) return denied('The requested date range is outside this assistant grant.')
            const rangeDays = Math.ceil(
                (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000,
            )
            if (granularity === 'raw' && rangeDays > 366) {
                return denied(
                    'Raw measurement queries are limited to 366 days. Use day, week, or month granularity for longer ranges.',
                )
            }
            if (granularity !== 'raw' && rangeDays > 3650) {
                return denied('Aggregated measurement queries are limited to 10 years.')
            }
            const timezone = await ownerTimezone()
            const records = (
                (await data.listObservations({
                    ...range,
                    definitionIds: uniqueDefinitionIds,
                })) as NumericObservation[]
            ).filter(record => !record.excluded)
            const series = uniqueDefinitionIds.map(definitionId => {
                const definition = metricDefinition(definitionId)!
                const matching = records.filter(record => record.definitionId === definitionId)
                const daily = groupDaily(matching, timezone, range.from, range.to)
                const points =
                    granularity === 'raw'
                        ? matching.slice(0, 1000).map(record => ({
                              observedAt: record.observedAt,
                              endedAt: record.endedAt ?? null,
                              value: record.canonicalValue,
                              unit: record.canonicalUnit,
                              source: observationSource(record),
                          }))
                        : granularity === 'week'
                          ? weeklyPoints(definitionId, daily)
                          : granularity === 'month'
                            ? monthlyPoints(definitionId, daily)
                            : daily
                const coveredPeriods =
                    granularity === 'raw'
                        ? matching.length
                        : (points as DailyInsightPoint[]).filter(point => point.value !== null)
                              .length
                return {
                    definitionId,
                    label: definition.name,
                    category: definition.category,
                    unit: definition.canonicalUnit,
                    dailyAggregation: dailyAggregation(definitionId),
                    periodAggregation:
                        granularity === 'raw' || granularity === 'day'
                            ? null
                            : periodAggregation(definitionId),
                    recordCount: matching.length,
                    coveredPeriods,
                    sources: sourceNames(matching, definitionId),
                    points,
                }
            })
            return textResult({
                series,
                metadata: {
                    timezone,
                    from: range.from,
                    to: range.to,
                    granularity: granularity as InsightGranularity,
                    grantedFrom: client.dateFrom?.toISOString() ?? null,
                    grantedTo: client.dateTo?.toISOString() ?? null,
                    missingDataNote: series.some(item => item.recordCount === 0)
                        ? 'One or more requested metrics had no measurements in this range.'
                        : null,
                    provenance: 'TrackIt effective measurement series',
                    interpretation:
                        'These are descriptive measurements and aggregates. Associations do not establish causation or a medical diagnosis.',
                },
            })
        },
    )
}
