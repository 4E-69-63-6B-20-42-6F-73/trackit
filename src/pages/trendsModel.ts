import {
    addCalendarDays,
    calendarDateFromKey,
    calendarDayRangeForKey,
} from '@trackit/domain/calendar'
import {
    dailySeries,
    weeklySeries,
    type DailyPoint,
    type NumericObservation,
    type TrendGranularity,
} from '@trackit/domain/health'
import { metricDefinition } from '@trackit/domain/metricCatalog'
import {
    convertMetricValue,
    displayUnitFor,
    formatMetricDisplayValue,
    type MetricPreferences,
} from '@trackit/domain/metrics'

export const trendRanges = { '7 days': 7, '30 days': 30, '90 days': 90 } as const
export type TrendRangeLabel = keyof typeof trendRanges

export const metricLabel = (definitionId: string) =>
    metricDefinition(definitionId)?.name ??
    definitionId.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())

export const recordedMetricIds = (records: Array<{ definitionId: string }>) => [
    ...new Set(records.map(record => record.definitionId)),
]

export const preferredMetricId = (recordedDefinitionIds: string[]) =>
    ['sleep', 'steps', 'weight', 'resting_heart_rate', 'energy'].find(candidate =>
        recordedDefinitionIds.includes(candidate),
    ) ?? recordedDefinitionIds[0] ?? null

export const resolveActiveMetric = (
    selected: string | null,
    requested: string | null,
    recordedDefinitionIds: string[],
) => {
    if (selected && recordedDefinitionIds.includes(selected)) return selected
    if (requested && recordedDefinitionIds.includes(requested)) return requested
    return preferredMetricId(recordedDefinitionIds)
}

export const metricOptionsFor = (recordedDefinitionIds: string[]) => {
    const grouped = new Map<string, Array<{ value: string; label: string }>>()
    for (const id of recordedDefinitionIds) {
        const group = metricDefinition(id)?.category ?? 'Other recorded metrics'
        const items = grouped.get(group) ?? []
        items.push({ value: id, label: metricLabel(id) })
        grouped.set(group, items)
    }
    return [...grouped.entries()].map(([group, items]) => ({
        group,
        items: items.sort((left, right) => left.label.localeCompare(right.label)),
    }))
}

export const trendObservationRange = (
    todayKey: string,
    days: number,
    timezone: string,
    definitionIds: string[],
) => {
    const observationFromKey = addCalendarDays(todayKey, -(days * 2 - 1))
    const observationStart = calendarDayRangeForKey(observationFromKey, timezone).from
    const sleepLookbehindMs = definitionIds.some(id => id.startsWith('sleep'))
        ? 36 * 60 * 60 * 1000
        : 0
    return {
        from: new Date(observationStart.getTime() - sleepLookbehindMs).toISOString(),
        to: calendarDayRangeForKey(todayKey, timezone).to.toISOString(),
        definitionIds,
    }
}

const averageOf = (values: number[]) =>
    values.length ? values.reduce((total, value) => total + value, 0) / values.length : null

export type TrendPresentation = {
    points: DailyPoint[]
    comparisonPoints: DailyPoint[]
    average: number | null
    periodChange: number | null
    coveredCount: number
    pointCount: number
    coverageRatio: number
    confidence: 'High coverage' | 'Partial coverage' | 'Low coverage'
    isNutritionMetric: boolean
    isManualMetric: boolean
    displayUnit?: string
    currentStart: Date
    primaryRecords: NumericObservation[]
}

export function buildTrendPresentation({
    observations,
    activeDefinitionId,
    comparisonDefinitionId,
    granularity,
    days,
    todayKey,
    timezone,
    metricPreferences,
}: {
    observations: NumericObservation[]
    activeDefinitionId: string | null
    comparisonDefinitionId: string | null
    granularity: TrendGranularity
    days: number
    todayKey: string
    timezone: string
    metricPreferences?: MetricPreferences
}): TrendPresentation {
    const currentStartKey = addCalendarDays(todayKey, -(days - 1))
    const previousStartKey = addCalendarDays(todayKey, -(days * 2 - 1))
    const currentStart = calendarDateFromKey(currentStartKey, timezone)
    const previousStart = calendarDateFromKey(previousStartKey, timezone)
    const primaryRecords = observations.filter(
        record => record.definitionId === activeDefinitionId && !record.excluded,
    )
    const comparisonRecords = observations.filter(
        record => record.definitionId === comparisonDefinitionId && !record.excluded,
    )
    const displayUnit = activeDefinitionId
        ? displayUnitFor(activeDefinitionId, metricPreferences)
        : undefined
    const convert = (value: number) =>
        activeDefinitionId &&
        metricDefinition(activeDefinitionId) &&
        primaryRecords[0]?.canonicalUnit &&
        displayUnit
            ? convertMetricValue(
                  activeDefinitionId,
                  value,
                  primaryRecords[0].canonicalUnit,
                  displayUnit,
              )
            : value
    const seriesFor = (records: NumericObservation[], start: Date) =>
        (granularity === 'weekly' ? weeklySeries : dailySeries)(records, start, days, timezone)
    const points = seriesFor(primaryRecords, currentStart).map(point => ({
        ...point,
        value: point.value === null ? null : convert(point.value),
    }))
    const previousPoints = seriesFor(primaryRecords, previousStart).map(point => ({
        ...point,
        value: point.value === null ? null : convert(point.value),
    }))
    const comparisonPoints = seriesFor(comparisonRecords, currentStart)
    const coveredValues = points.flatMap(point => (point.value === null ? [] : [point.value]))
    const previousValues = previousPoints.flatMap(point =>
        point.value === null ? [] : [point.value],
    )
    const average = averageOf(coveredValues)
    const previousAverage = averageOf(previousValues)
    const periodChange =
        average !== null && previousAverage !== null ? average - previousAverage : null
    const coverageRatio = points.length ? coveredValues.length / points.length : 0
    const confidence =
        coverageRatio >= 0.75
            ? 'High coverage'
            : coverageRatio >= 0.4
              ? 'Partial coverage'
              : 'Low coverage'
    return {
        points,
        comparisonPoints,
        average,
        periodChange,
        coveredCount: coveredValues.length,
        pointCount: points.length,
        coverageRatio,
        confidence,
        isNutritionMetric: activeDefinitionId
            ? metricDefinition(activeDefinitionId)?.source === 'meal'
            : false,
        isManualMetric: activeDefinitionId
            ? metricDefinition(activeDefinitionId)?.source === 'manual'
            : false,
        displayUnit,
        currentStart,
        primaryRecords,
    }
}

export const formatTrendValue = (
    definitionId: string | null,
    displayUnit: string | undefined,
    value: number,
    metricPreferences?: MetricPreferences,
    locale?: string,
    options?: { signed?: boolean; withUnit?: boolean },
) =>
    definitionId && displayUnit
        ? formatMetricDisplayValue(
              definitionId,
              value,
              displayUnit,
              metricPreferences,
              locale,
              options,
          )
        : value.toLocaleString(locale)
