import { Button, SegmentedControl, Select, Text } from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { TrendChart } from '../components/TrendChart'
import { CorrelationNote } from '../components/CorrelationNote'
import { ObservationRecords } from '../components/ObservationRecords'
import {
    dailySeries,
    displayValue,
    weeklySeries,
    type Observation,
    type TrendGranularity,
} from '../domain/health'
import { listObservations, setObservationExcluded } from '../lib/observationApi'
import { listTrendViews, saveTrendView, type TrendViewRecord } from '../lib/trendApi'
import { getPreferences, type Preferences } from '../lib/preferencesApi'

const ranges = { '7D': 7, '30D': 30, '90D': 90 } as const

export function Trends() {
    const [observations, setObservations] = useState<Observation[]>([])
    const [range, setRange] = useState<keyof typeof ranges>('7D')
    const [metric, setMetric] = useState<string | null>(null)
    const [comparisonMetric, setComparisonMetric] = useState<string | null>(null)
    const [granularity, setGranularity] = useState<TrendGranularity>('daily')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [savedViews, setSavedViews] = useState<TrendViewRecord[]>([])
    const [selectedView, setSelectedView] = useState<string | null>(null)
    const [inspectedIds, setInspectedIds] = useState<string[] | null>(null)
    const [preferences, setPreferences] = useState<Preferences | null>(null)
    const [actionError, setActionError] = useState('')

    useEffect(() => {
        const from = new Date()
        from.setUTCDate(from.getUTCDate() - 90)
        void listObservations({ from: from.toISOString() })
            .then(records => {
                setObservations(records)
                setMetric(records[0]?.metric ?? 'sleep')
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        void listTrendViews()
            .then(setSavedViews)
            .catch(() => undefined)
    }, [])

    useEffect(() => {
        void getPreferences()
            .then(setPreferences)
            .catch(() => undefined)
    }, [])

    const metrics = [...new Set(observations.map(record => record.metric))]
    const start = useMemo(() => {
        const days = ranges[range]
        const value = new Date()
        value.setUTCHours(12, 0, 0, 0)
        value.setUTCDate(value.getUTCDate() - days + 1)
        return value
    }, [range])
    const points = useMemo(() => {
        const metricRecords = observations.filter(record => record.metric === metric)
        const series = (granularity === 'weekly' ? weeklySeries : dailySeries)(
            metricRecords,
            start,
            ranges[range],
            preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        )
        const canonicalUnit = metricRecords[0]?.canonicalUnit
        const displayUnit =
            preferences?.units === 'imperial' && canonicalUnit === 'kg' ? 'lb' : canonicalUnit
        return series.map(point => ({
            ...point,
            value:
                point.value !== null && canonicalUnit && displayUnit
                    ? displayValue(point.value, canonicalUnit, displayUnit)
                    : point.value,
        }))
    }, [granularity, metric, observations, preferences, range, start])

    const toggleExcluded = async (observation: Observation) => {
        try {
            const updated = await setObservationExcluded(observation, !observation.excluded)
            setObservations(current =>
                current.map(record => (record.id === updated.id ? updated : record)),
            )
            setActionError('')
        } catch {
            setActionError('The observation could not be updated. Try again.')
        }
    }

    const saveView = async () => {
        if (!metric) return
        try {
            const saved = await saveTrendView({
                name: `${metric} · ${range}`,
                metric,
                comparisonMetric: comparisonMetric ?? undefined,
                rangeDays: ranges[range],
                granularity,
            })
            setSavedViews(current => [saved, ...current])
            setSelectedView(saved.id)
            setActionError('')
        } catch {
            setActionError('The trend view could not be saved. Try again.')
        }
    }

    const loadView = (id: string | null) => {
        setInspectedIds(null)
        setSelectedView(id)
        const view = savedViews.find(item => item.id === id)
        if (!view) return
        setMetric(view.metric)
        setComparisonMetric(view.comparisonMetric)
        setGranularity(view.granularity)
        const nextRange = Object.entries(ranges).find(([, days]) => days === view.rangeDays)?.[0]
        if (nextRange) setRange(nextRange as keyof typeof ranges)
    }

    return (
        <div className="page-content simple-page">
            <Text className="date">EXPLORE</Text>
            <h1>Trends</h1>
            <Text className="subhead">
                Real observations, visible gaps, and a direct path back to source records.
            </Text>
            <section className="panel chart-large">
                <div className="panel-head">
                    <div>
                        <Text className="eyebrow">PERSONAL HISTORY</Text>
                        <h2>{metric ?? 'Choose a metric'}</h2>
                    </div>
                    <div className="trend-controls">
                        <Select
                            clearable
                            aria-label="Saved trend view"
                            value={selectedView}
                            onChange={loadView}
                            data={savedViews.map(view => ({ label: view.name, value: view.id }))}
                            placeholder="Saved views"
                        />
                        <Select
                            aria-label="Trend metric"
                            value={metric}
                            onChange={value => {
                                setMetric(value)
                                setInspectedIds(null)
                            }}
                            data={metrics}
                            placeholder="Metric"
                        />
                        <Select
                            clearable
                            aria-label="Comparison metric"
                            value={comparisonMetric}
                            onChange={setComparisonMetric}
                            data={metrics.filter(value => value !== metric)}
                            placeholder="Compare with"
                        />
                        <SegmentedControl
                            size="xs"
                            data={Object.keys(ranges)}
                            value={range}
                            onChange={value => {
                                setRange(value as keyof typeof ranges)
                                setInspectedIds(null)
                            }}
                        />
                        <SegmentedControl
                            aria-label="Trend aggregation"
                            size="xs"
                            data={[
                                { label: 'Daily', value: 'daily' },
                                { label: 'Weekly', value: 'weekly' },
                            ]}
                            value={granularity}
                            onChange={value => {
                                setGranularity(value as TrendGranularity)
                                setInspectedIds(null)
                            }}
                        />
                        <Button size="xs" variant="default" onClick={() => void saveView()}>
                            Save view
                        </Button>
                    </div>
                </div>
                <TrendChart
                    points={points}
                    loading={loading}
                    error={error}
                    metric={metric ?? ''}
                    onInspect={setInspectedIds}
                    periodLabel={granularity === 'weekly' ? 'week' : 'day'}
                />
                {actionError && (
                    <Text role="alert" c="orange" size="sm">
                        {actionError}
                    </Text>
                )}
                {metric && comparisonMetric && (
                    <CorrelationNote
                        observations={observations}
                        metric={metric}
                        comparisonMetric={comparisonMetric}
                        start={start}
                        days={ranges[range]}
                        timezone={
                            preferences?.timezone ??
                            Intl.DateTimeFormat().resolvedOptions().timeZone
                        }
                    />
                )}
                <ObservationRecords
                    observations={observations.filter(
                        record =>
                            record.metric === metric &&
                            (!inspectedIds || inspectedIds.includes(record.id)),
                    )}
                    onToggleExcluded={observation => void toggleExcluded(observation)}
                    showAll={Boolean(inspectedIds)}
                />
            </section>
        </div>
    )
}
