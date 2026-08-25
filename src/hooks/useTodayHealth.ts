import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Observation } from '../domain/health'
import { listDailyMetrics, type DailyMetric } from '../lib/dailyMetricApi'
import { listObservations } from '../lib/observationApi'
import { listGoalEvaluations } from '../lib/goalApi'
import type { GoalEvaluation } from '../domain/goals'
import { useServerData } from './useServerData'

const dateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const asObservation = (row: DailyMetric): Observation => ({
    id: `daily:${row.date}:${row.metric}`,
    metric: row.metric,
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
    const [daily, setDaily] = useState<DailyMetric[]>([])
    const [details, setDetails] = useState<Observation[]>([])
    const [goalEvaluations, setGoalEvaluations] = useState<Record<string, GoalEvaluation>>({})
    const [loading, setLoading] = useState(true)
    const [unavailable, setUnavailable] = useState(false)
    const selectedKey = dateKey(selectedDate)
    const load = useCallback(
        (signal: AbortSignal) => {
            const fromDate = new Date(selectedDate)
            fromDate.setDate(fromDate.getDate() - 29)
            const dayStart = new Date(selectedDate)
            dayStart.setHours(0, 0, 0, 0)
            const dayEnd = new Date(selectedDate)
            dayEnd.setHours(0, 0, 0, 0)
            dayEnd.setDate(dayEnd.getDate() + 1)
            queueMicrotask(() => {
                if (!signal.aborted) setLoading(true)
            })
            return Promise.all([
                listDailyMetrics({ from: dateKey(fromDate), to: selectedKey }, signal),
                listObservations(
                    {
                        from: dayStart.toISOString(),
                        to: dayEnd.toISOString(),
                        metrics: [
                            'steps',
                            'water',
                            'sleep',
                            'resting_heart_rate',
                            'energy',
                            'weight',
                        ],
                    },
                    signal,
                ),
                listGoalEvaluations(signal, selectedDate.toISOString()),
            ])
                .then(([metrics, observations, evaluations]) => {
                    setDaily(metrics)
                    setDetails(observations)
                    setGoalEvaluations(evaluations)
                    setUnavailable(false)
                })
                .catch(error => {
                    if (error instanceof DOMException && error.name === 'AbortError') return
                    setUnavailable(true)
                })
                .finally(() => {
                    if (!signal.aborted) setLoading(false)
                })
        },
        [selectedDate, selectedKey],
    )

    useEffect(() => {
        let controller = new AbortController()
        void load(controller.signal)
        const refresh = () => {
            controller.abort()
            controller = new AbortController()
            void load(controller.signal)
        }
        window.addEventListener('trackit:observations-changed', refresh)
        window.addEventListener('trackit:preferences-saved', refresh)
        return () => {
            controller.abort()
            window.removeEventListener('trackit:observations-changed', refresh)
            window.removeEventListener('trackit:preferences-saved', refresh)
        }
    }, [load])

    return useMemo(() => {
        const todayRows = daily.filter(row => row.date === selectedKey)
        const dailyMetric = (metric: string) => todayRows.find(row => row.metric === metric) ?? null
        const latestDetail = (metric: string) =>
            details
                .filter(row => row.metric === metric && !row.excluded)
                .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ??
            (dailyMetric(metric) ? asObservation(dailyMetric(metric)!) : null)
        const aggregateDetail = (metric: string) => {
            const rows = details.filter(row => row.metric === metric && !row.excluded)
            if (rows.length)
                return {
                    ...rows[0],
                    canonicalValue: rows.reduce((sum, row) => sum + row.canonicalValue, 0),
                }
            return dailyMetric(metric) ? asObservation(dailyMetric(metric)!) : null
        }
        const values = (metric: string) =>
            daily.filter(row => row.metric === metric).sort((a, b) => a.date.localeCompare(b.date))
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
        const activeGoal = (metric: string) =>
            goals.find(goal => {
                const weekday = selectedDate.getDay()
                return (
                    goal.metricId === metric &&
                    new Date(goal.effectiveFrom) <= selectedDate &&
                    (!goal.effectiveTo || new Date(goal.effectiveTo) >= selectedDate) &&
                    (!goal.schedule.weekdays?.length || goal.schedule.weekdays.includes(weekday))
                )
            }) ?? null
        const sleepByDate = new Map(values('sleep').map(row => [row.date, row]))
        const sleepRows = Array.from({ length: 7 }, (_, offset) => {
            const date = new Date(selectedDate)
            date.setDate(date.getDate() - 6 + offset)
            const key = dateKey(date)
            return { key, row: sleepByDate.get(key) }
        })
        const effectiveTotal = (metric: string) => {
            const rows = details.filter(row => row.metric === metric && !row.excluded)
            return rows.length
                ? rows.reduce((sum, row) => sum + row.canonicalValue, 0)
                : (dailyMetric(metric)?.value ?? 0)
        }
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
            preferences,
        }
    }, [
        daily,
        details,
        goals,
        goalEvaluations,
        loading,
        preferences,
        selectedDate,
        selectedKey,
        sharedLoading,
        sharedUnavailable,
        unavailable,
    ])
}
