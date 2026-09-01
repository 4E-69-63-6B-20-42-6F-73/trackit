import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { addCalendarDays, calendarDateKey, calendarDayRangeForKey } from '../domain/calendar'
import type { GoalEvaluation } from '../domain/goals'
import type { NumericObservation } from '../domain/health'
import { metricDefinition } from '../domain/metricCatalog'
import { compareTodayHeadlineMetrics, isTodayHeadlineMetric } from '../domain/todaySummary'
import { listDailyMetrics, type DailyMetric } from '../lib/dailyMetricApi'
import { listGoalEvaluations } from '../lib/goalApi'
import { healthQueryKeys } from '../lib/healthQueries'
import { listObservations } from '../lib/observationApi'
import { useServerData } from './useServerData'

const asObservation = (row: DailyMetric): NumericObservation => ({
    id: `daily:${row.date}:${row.definitionId}`,
    definitionId: row.definitionId,
    canonicalValue: row.value,
    canonicalUnit: row.unit,
    originalValue: row.value,
    originalUnit: row.unit,
    observedAt: `${row.date}T12:00:00.000Z`,
    excluded: false,
    version: row.derivationVersion,
})

export function useTodayHealth(selectedDate: Date = new Date()) {
    const {
        preferences,
        goals,
        loading: sharedLoading,
        unavailable: sharedUnavailable,
    } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const selectedKey = calendarDateKey(selectedDate, timezone)
    const day = calendarDayRangeForKey(selectedKey, timezone)
    const dailyRange = { from: addCalendarDays(selectedKey, -29), to: selectedKey }
    const observationRange = { from: day.from.toISOString(), to: day.to.toISOString() }
    const evaluationAt = new Date(Math.min(day.to.getTime() - 1, Date.now())).toISOString()
    const dailyQuery = useQuery({
        queryKey: [...healthQueryKeys.dailyMetrics, dailyRange],
        queryFn: ({ signal }) => listDailyMetrics(dailyRange, signal),
    })
    const observationsQuery = useQuery({
        queryKey: [...healthQueryKeys.observations, observationRange],
        queryFn: ({ signal }) => listObservations(observationRange, signal),
    })
    const goalEvaluationsQuery = useQuery({
        queryKey: [...healthQueryKeys.goalEvaluations, selectedKey],
        queryFn: ({ signal }) => listGoalEvaluations(signal, evaluationAt),
    })
    const daily = dailyQuery.data ?? []
    const details = observationsQuery.data ?? []
    const goalEvaluations = goalEvaluationsQuery.data ?? ({} as Record<string, GoalEvaluation>)
    const loading =
        dailyQuery.isPending || observationsQuery.isPending || goalEvaluationsQuery.isPending
    const unavailable =
        dailyQuery.isError || observationsQuery.isError || goalEvaluationsQuery.isError

    return useMemo(() => {
        const todayRows = daily.filter(row => row.date === selectedKey)
        const dailyMetric = (definitionId: string) =>
            todayRows.find(row => row.definitionId === definitionId) ?? null
        const latestDetail = (metric: string) =>
            details
                .filter(row => row.definitionId === metric && !row.excluded)
                .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ??
            (dailyMetric(metric) ? asObservation(dailyMetric(metric)!) : null)
        const aggregateDetail = (metric: string) => {
            const rows = details.filter(row => row.definitionId === metric && !row.excluded)
            if (rows.length)
                return {
                    ...rows[0],
                    canonicalValue: rows.reduce((sum, row) => sum + row.canonicalValue, 0),
                }
            return dailyMetric(metric) ? asObservation(dailyMetric(metric)!) : null
        }
        const values = (metric: string) =>
            daily
                .filter(row => row.definitionId === metric)
                .sort((a, b) => a.date.localeCompare(b.date))
        const baseline = (metric: string) => {
            const rows = values(metric)
            const current = rows.find(row => row.date === selectedKey)
            const prior = rows.filter(row => row.date !== selectedKey)
            if (!current || prior.length < 2) return null
            const average = prior.reduce((sum, row) => sum + row.value, 0) / prior.length
            return {
                current: current.value,
                baseline: average,
                delta: current.value - average,
                sampleSize: prior.length,
                unit: current.unit,
            }
        }
        const weekday = new Date(`${selectedKey}T12:00:00.000Z`).getUTCDay()
        const activeGoals = goals.filter(goal => {
            const effectiveFrom = calendarDateKey(new Date(goal.effectiveFrom), timezone)
            const effectiveTo = goal.effectiveTo
                ? calendarDateKey(new Date(goal.effectiveTo), timezone)
                : null
            return (
                effectiveFrom <= selectedKey &&
                (!effectiveTo || effectiveTo >= selectedKey) &&
                (!goal.schedule.weekdays?.length || goal.schedule.weekdays.includes(weekday))
            )
        })
        const activeGoal = (metric: string) =>
            activeGoals.find(goal => goal.metricId === metric) ?? null
        const sleepByDate = new Map(values('sleep').map(row => [row.date, row]))
        const sleepRows = Array.from({ length: 7 }, (_, offset) => {
            const key = addCalendarDays(selectedKey, -6 + offset)
            return { key, row: sleepByDate.get(key) }
        })
        const effectiveTotal = (metric: string) => {
            const rows = details.filter(row => row.definitionId === metric && !row.excluded)
            return rows.length
                ? rows.reduce((sum, row) => sum + row.canonicalValue, 0)
                : (dailyMetric(metric)?.value ?? 0)
        }
        const summaryMetrics = todayRows
            .flatMap(row => {
                const definition = metricDefinition(row.definitionId)
                return definition && isTodayHeadlineMetric(definition) ? [{ row, definition }] : []
            })
            .sort((left, right) => compareTodayHeadlineMetrics(left.definition, right.definition))
            .slice(0, 4)
            .map(({ row, definition }) => ({
                definition,
                observation:
                    details
                        .filter(item => item.definitionId === row.definitionId && !item.excluded)
                        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? null,
                value: row.value,
                baseline: baseline(row.definitionId),
            }))
        const dailyGoals = activeGoals
            .filter(goal => goal.period.type === 'day')
            .map(goal => ({ goal, evaluation: goalEvaluations[goal.id] }))
            .sort((left, right) => {
                const leftMet = left.evaluation?.met === true ? 1 : 0
                const rightMet = right.evaluation?.met === true ? 1 : 0
                return leftMet - rightMet
            })

        return {
            loading: loading || sharedLoading,
            unavailable: unavailable || sharedUnavailable,
            steps: effectiveTotal('steps'),
            water: effectiveTotal('water'),
            sleepToday: aggregateDetail('sleep'),
            restingHeartRate: latestDetail('resting_heart_rate'),
            energy: latestDetail('energy'),
            weight: latestDetail('weight'),
            sleepSeries: sleepRows.map(({ key, row }) => ({
                day: new Date(`${key}T00:00:00Z`).toLocaleDateString(preferences?.locale, {
                    weekday: 'short',
                    timeZone: 'UTC',
                }),
                sleep: row?.value ?? null,
                recordIds: [],
            })),
            sleepBaseline: baseline('sleep'),
            restingBaseline: baseline('resting_heart_rate'),
            energyBaseline: baseline('energy'),
            weightBaseline: baseline('weight'),
            stepsGoal: activeGoal('steps'),
            waterGoal: activeGoal('water'),
            goalEvaluations,
            summaryMetrics,
            dailyGoals,
            preferences,
        }
    }, [
        daily,
        details,
        goals,
        goalEvaluations,
        loading,
        preferences,
        selectedKey,
        sharedLoading,
        sharedUnavailable,
        timezone,
        unavailable,
    ])
}
