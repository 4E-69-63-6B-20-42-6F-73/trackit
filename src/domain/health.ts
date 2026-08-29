import { metricDefinition } from './metricCatalog.js'
import { convertMetricValue } from './metrics.js'

export type Observation = {
    id: string
    definitionId: string
    canonicalValue: number
    canonicalUnit: string
    originalValue: number
    originalUnit: string
    observedAt: string
    endedAt?: string | null
    sourceId?: string | null
    externalId?: string | null
    provider?: string | null
    connector?: string | null
    metadata?: Record<string, unknown>
    excluded: boolean
    version: number
}

export type DailyPoint = {
    date: string
    value: number | null
    recordIds: string[]
    coveredDays?: number
    totalDays?: number
}
export type TrendGranularity = 'daily' | 'weekly'

const dailyAggregation = (definitionId: string) => {
    const definition = metricDefinition(definitionId)
    return definition?.goalCapabilities?.aggregations.total ? 'sum' : definition?.aggregations[0]
}

export function aggregateDailyObservations(records: Observation[]) {
    if (!records.length) return null
    const aggregation = dailyAggregation(records[0].definitionId) ?? 'latest'
    const values = records.map(record => record.canonicalValue).sort((left, right) => left - right)
    if (aggregation === 'sum') return values.reduce((sum, value) => sum + value, 0)
    if (aggregation === 'average')
        return values.reduce((sum, value) => sum + value, 0) / values.length
    if (aggregation === 'max') return Math.max(...values)
    return [...records].sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0]
        .canonicalValue
}

export const displayValue = (
    definitionId: string,
    value: number,
    canonicalUnit: string,
    displayUnit: string,
) => convertMetricValue(definitionId, value, canonicalUnit, displayUnit)

export function dailySeries(
    observations: Observation[],
    start: Date,
    days: number,
    timezone = 'UTC',
): DailyPoint[] {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
    const buckets = new Map<string, Observation[]>()
    for (const observation of observations.filter(record => !record.excluded)) {
        const key = formatter.format(new Date(observation.observedAt))
        buckets.set(key, [...(buckets.get(key) ?? []), observation])
    }
    return Array.from({ length: days }, (_, offset) => {
        const date = new Date(start)
        date.setUTCDate(date.getUTCDate() + offset)
        const key = formatter.format(date)
        const records = buckets.get(key) ?? []
        const ordered = [...records].sort((left, right) =>
            right.observedAt.localeCompare(left.observedAt),
        )
        const additive = records.length > 0 && dailyAggregation(records[0].definitionId) === 'sum'
        return {
            date: key,
            value: aggregateDailyObservations(records),
            recordIds: additive
                ? records.map(record => record.id)
                : ordered.slice(0, 1).map(record => record.id),
        }
    })
}

export function weeklySeries(
    observations: Observation[],
    start: Date,
    days: number,
    timezone = 'UTC',
): DailyPoint[] {
    const daily = dailySeries(observations, start, days, timezone)
    const additive = observations.some(record => dailyAggregation(record.definitionId) === 'sum')
    const weeks: DailyPoint[] = []
    for (let offset = 0; offset < daily.length; offset += 7) {
        const period = daily.slice(offset, offset + 7)
        const covered = period.filter(
            (point): point is DailyPoint & { value: number } => point.value !== null,
        )
        weeks.push({
            date: period.length > 1 ? `${period[0].date} – ${period.at(-1)!.date}` : period[0].date,
            value: covered.length
                ? additive
                    ? covered.reduce((sum, point) => sum + point.value, 0)
                    : covered.reduce((sum, point) => sum + point.value, 0) / covered.length
                : null,
            recordIds: covered.flatMap(point => point.recordIds),
            coveredDays: covered.length,
            totalDays: period.length,
        })
    }
    return weeks
}

export function pearsonCorrelation(left: number[], right: number[]) {
    if (left.length !== right.length || left.length < 2) return null
    const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length
    const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length
    const numerator = left.reduce(
        (sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean),
        0,
    )
    const leftSpread = left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0)
    const rightSpread = right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0)
    const denominator = Math.sqrt(leftSpread * rightSpread)
    return denominator ? numerator / denominator : null
}

export function rollingBaselineDelta(
    observations: Observation[],
    definitionId: string,
    now: Date,
    timezone: string,
    days = 30,
) {
    const start = new Date(now)
    start.setUTCHours(12, 0, 0, 0)
    start.setUTCDate(start.getUTCDate() - days + 1)
    const points = dailySeries(
        observations.filter(record => record.definitionId === definitionId),
        start,
        days,
        timezone,
    )
    const current = points.at(-1)?.value ?? null
    const baselineValues = points
        .slice(0, -1)
        .map(point => point.value)
        .filter((value): value is number => value !== null)
    if (current === null || baselineValues.length < 2) return null
    const baseline = baselineValues.reduce((sum, value) => sum + value, 0) / baselineValues.length
    return { current, baseline, delta: current - baseline, sampleSize: baselineValues.length }
}
