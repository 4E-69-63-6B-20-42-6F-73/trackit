import { useEffect, useMemo, useState } from 'react'
import { dailySeries, rollingBaselineDelta, type Observation } from '../domain/health'
import { listGoals, type GoalRecord } from '../lib/goalApi'
import { listObservations } from '../lib/observationApi'
import { getPreferences, type Preferences } from '../lib/preferencesApi'

export function useTodayHealth() {
    const [observations, setObservations] = useState<Observation[]>([])
    const [goals, setGoals] = useState<GoalRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [unavailable, setUnavailable] = useState(false)
    const [preferences, setPreferences] = useState<Preferences | null>(null)

    useEffect(() => {
        let active = true
        const load = () => {
            const from = new Date()
            from.setDate(from.getDate() - 30)
            void Promise.all([
                listObservations({ from: from.toISOString() }),
                listGoals(),
                getPreferences().catch(() => null),
            ])
                .then(([records, savedGoals, savedPreferences]) => {
                    if (!active) return
                    setObservations(records)
                    setGoals(savedGoals)
                    if (savedPreferences) setPreferences(savedPreferences)
                    setUnavailable(false)
                })
                .catch(() => active && setUnavailable(true))
                .finally(() => active && setLoading(false))
        }
        load()
        window.addEventListener('trackit:observations-changed', load)
        return () => {
            active = false
            window.removeEventListener('trackit:observations-changed', load)
        }
    }, [])

    return useMemo(() => {
        const now = new Date()
        const timezone = preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        const dayFormatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
        const todayKey = dayFormatter.format(now)
        const today = observations.filter(
            record => dayFormatter.format(new Date(record.observedAt)) === todayKey,
        )
        const metric = (name: string) =>
            today
                .filter(record => record.metric === name && !record.excluded)
                .sort((left, right) => right.observedAt.localeCompare(left.observedAt))
        const sum = (name: string) =>
            metric(name).reduce((total, record) => total + record.canonicalValue, 0)
        const latest = (name: string) => metric(name)[0] ?? null
        const sleepStart = new Date(now)
        sleepStart.setUTCHours(12, 0, 0, 0)
        sleepStart.setUTCDate(sleepStart.getUTCDate() - 6)
        const sleep = dailySeries(
            observations.filter(record => record.metric === 'sleep'),
            sleepStart,
            7,
            timezone,
        ).map(point => ({
            day: new Date(`${point.date}T00:00:00Z`).toLocaleDateString(preferences?.locale, {
                weekday: 'short',
                timeZone: 'UTC',
            }),
            sleep: point.value,
            recordIds: point.recordIds,
        }))
        const activeGoal = (name: string) =>
            goals.find(goal => {
                const starts = new Date(goal.effectiveFrom) <= now
                const ends = !goal.effectiveTo || new Date(goal.effectiveTo) >= now
                const weekday = new Intl.DateTimeFormat('en-US', {
                    timeZone: timezone,
                    weekday: 'short',
                }).format(now)
                const weekdayNumber = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
                    weekday,
                )
                const scheduled =
                    !goal.schedule.weekdays?.length ||
                    goal.schedule.weekdays.includes(weekdayNumber)
                return goal.metric === name && starts && ends && scheduled
            }) ?? null
        return {
            loading,
            unavailable,
            steps: sum('steps'),
            water: sum('water'),
            sleepToday: latest('sleep')
                ? { ...latest('sleep')!, canonicalValue: sum('sleep') }
                : null,
            restingHeartRate: latest('resting_heart_rate'),
            energy: latest('energy'),
            weight: latest('weight'),
            sleepSeries: sleep,
            sleepBaseline: rollingBaselineDelta(observations, 'sleep', now, timezone),
            restingBaseline: rollingBaselineDelta(
                observations,
                'resting_heart_rate',
                now,
                timezone,
            ),
            stepsGoal: activeGoal('steps'),
            waterGoal: activeGoal('water'),
            preferences,
        }
    }, [goals, loading, observations, preferences, unavailable])
}
