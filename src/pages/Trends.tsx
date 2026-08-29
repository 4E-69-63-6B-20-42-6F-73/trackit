import { Alert, Badge, Button, Menu, SegmentedControl, Select, Text } from '@mantine/core'
import {
    IconAdjustments,
    IconBookmark,
    IconChartLine,
    IconChevronDown,
    IconPlugConnected,
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CorrelationNote } from '../components/CorrelationNote'
import { ObservationRecords } from '../components/ObservationRecords'
import { PageHeader } from '../components/PageHeader'
import { TrendChart } from '../components/TrendChart'
import {
    dailySeries,
    weeklySeries,
    type NumericObservation,
    type TrendGranularity,
} from '../domain/health'
import { metricDefinition } from '../domain/metricCatalog'
import {
    convertMetricValue,
    displayUnitFor,
    formatMetricDisplayValue,
    unitPresentation,
} from '../domain/metrics'
import { useServerData } from '../hooks/useServerData'
import { listDailyMetrics, type DailyMetric } from '../lib/dailyMetricApi'
import { listObservations, setObservationExcluded } from '../lib/observationApi'
import { listTrendViews, saveTrendView, type TrendViewRecord } from '../lib/trendApi'
import '../trends.css'

const ranges = { '7 days': 7, '30 days': 30, '90 days': 90 } as const

const metricLabel = (definitionId: string) =>
    metricDefinition(definitionId)?.name ??
    definitionId.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())

const dateDaysAgo = (days: number) => {
    const value = new Date()
    value.setUTCHours(12, 0, 0, 0)
    value.setUTCDate(value.getUTCDate() - days)
    return value
}

export function Trends() {
    const navigate = useNavigate()
    const { preferences } = useServerData()
    const [observations, setObservations] = useState<NumericObservation[]>([])
    const [availableMetrics, setAvailableMetrics] = useState<DailyMetric[]>([])
    const [range, setRange] = useState<keyof typeof ranges>('30 days')
    const [definitionId, setDefinitionId] = useState<string | null>(null)
    const [comparisonDefinitionId, setComparisonDefinitionId] = useState<string | null>(null)
    const [showCompare, setShowCompare] = useState(false)
    const [showAnalysis, setShowAnalysis] = useState(false)
    const [granularity, setGranularity] = useState<TrendGranularity>('daily')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [savedViews, setSavedViews] = useState<TrendViewRecord[]>([])
    const [selectedView, setSelectedView] = useState<string | null>(null)
    const [inspectedIds, setInspectedIds] = useState<string[] | null>(null)
    const [actionError, setActionError] = useState('')

    useEffect(() => {
        const from = dateDaysAgo(180)
        void listDailyMetrics({
            from: from.toISOString().slice(0, 10),
            to: new Date().toISOString().slice(0, 10),
        })
            .then(records => {
                setAvailableMetrics(records)
                const recorded = [...new Set(records.map(record => record.definitionId))]
                const preferred = ['sleep', 'steps', 'weight', 'resting_heart_rate', 'energy'].find(
                    candidate => recorded.includes(candidate),
                )
                setDefinitionId(preferred ?? recorded[0] ?? null)
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false))
        void listTrendViews()
            .then(setSavedViews)
            .catch(() => undefined)
    }, [])

    useEffect(() => {
        if (!definitionId) return
        const from = dateDaysAgo(ranges[range] * 2 - 1)
        queueMicrotask(() => setLoading(true))
        void listObservations({
            from: from.toISOString(),
            to: new Date().toISOString(),
            definitionIds: [
                definitionId,
                ...(comparisonDefinitionId ? [comparisonDefinitionId] : []),
            ],
        })
            .then(records => {
                setObservations(records)
                setError(false)
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false))
    }, [comparisonDefinitionId, definitionId, range])

    const recordedDefinitionIds = useMemo(
        () => [...new Set(availableMetrics.map(record => record.definitionId))],
        [availableMetrics],
    )
    const metricOptions = useMemo(() => {
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
    }, [recordedDefinitionIds])

    const days = ranges[range]
    const timezone = preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    const currentStart = useMemo(() => dateDaysAgo(days - 1), [days])
    const previousStart = useMemo(() => dateDaysAgo(days * 2 - 1), [days])
    const primaryRecords = observations.filter(
        record => record.definitionId === definitionId && !record.excluded,
    )
    const comparisonRecords = observations.filter(
        record => record.definitionId === comparisonDefinitionId && !record.excluded,
    )
    const displayUnit = definitionId
        ? displayUnitFor(definitionId, preferences?.metricPreferences, preferences?.units)
        : undefined
    const convert = (value: number) =>
        definitionId && metricDefinition(definitionId) && primaryRecords[0]?.canonicalUnit && displayUnit
            ? convertMetricValue(definitionId, value, primaryRecords[0].canonicalUnit, displayUnit)
            : value
    const formatDisplayValue = (
        value: number,
        options?: { signed?: boolean; withUnit?: boolean },
    ) =>
        definitionId && displayUnit
            ? formatMetricDisplayValue(
                  definitionId,
                  value,
                  displayUnit,
                  preferences?.metricPreferences,
                  preferences?.locale,
                  options,
              )
            : value.toLocaleString(preferences?.locale)

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
    const average = coveredValues.length
        ? coveredValues.reduce((total, value) => total + value, 0) / coveredValues.length
        : null
    const previousAverage = previousValues.length
        ? previousValues.reduce((total, value) => total + value, 0) / previousValues.length
        : null
    const periodChange =
        average !== null && previousAverage !== null ? average - previousAverage : null
    const coverageRatio = points.length ? coveredValues.length / points.length : 0
    const confidence =
        coverageRatio >= 0.75
            ? 'High coverage'
            : coverageRatio >= 0.4
              ? 'Partial coverage'
              : 'Low coverage'
    const isNutritionMetric = definitionId
        ? metricDefinition(definitionId)?.source === 'meal'
        : false
    const isManualMetric = definitionId
        ? metricDefinition(definitionId)?.source === 'manual'
        : false

    const toggleExcluded = async (observation: NumericObservation) => {
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
        if (!definitionId) return
        try {
            const saved = await saveTrendView({
                name: `${metricLabel(definitionId)} · ${range}`,
                metric: definitionId,
                comparisonMetric: comparisonDefinitionId ?? undefined,
                rangeDays: days,
                granularity,
            })
            setSavedViews(current => [saved, ...current])
            setSelectedView(saved.id)
            setActionError('')
        } catch {
            setActionError('The trend view could not be saved. Try again.')
        }
    }

    const loadView = (id: string) => {
        const view = savedViews.find(item => item.id === id)
        if (!view) return
        setSelectedView(view.id)
        setDefinitionId(view.metric)
        setComparisonDefinitionId(view.comparisonMetric)
        setShowCompare(Boolean(view.comparisonMetric))
        setShowAnalysis(false)
        setGranularity(view.granularity)
        setInspectedIds(null)
        const nextRange = Object.entries(ranges).find(([, value]) => value === view.rangeDays)?.[0]
        if (nextRange) setRange(nextRange as keyof typeof ranges)
    }

    const pageEmpty = !loading && (error || recordedDefinitionIds.length === 0)

    return (
        <div className="page-content trends-page trends-revamp">
            <PageHeader
                title="Trends"
                description="See how your observations change over time."
            />

            {pageEmpty ? (
                <section className="panel page-empty">
                    <IconChartLine size={28} />
                    <h2>{error ? 'Trends are unavailable' : 'No trends to show yet'}</h2>
                    <Text c="dimmed" size="sm">
                        {error
                            ? 'TrackIt could not load your observations. Review the server and connection status.'
                            : 'Trends appear after measurements, activities, sleep, meals, or other observations have been recorded.'}
                    </Text>
                    <Button
                        leftSection={<IconPlugConnected size={17} />}
                        onClick={() => navigate('/settings/connections')}
                    >
                        Review connections
                    </Button>
                </section>
            ) : (
                <section className="panel chart-large trends-surface">
                    <div className="trends-toolbar">
                        <div className="trends-primary-controls">
                            <Select
                                label="Metric"
                                aria-label="Trend metric"
                                value={definitionId}
                                onChange={value => {
                                    setDefinitionId(value)
                                    if (value === comparisonDefinitionId) setComparisonDefinitionId(null)
                                    setInspectedIds(null)
                                    setShowAnalysis(false)
                                }}
                                data={metricOptions}
                                allowDeselect={false}
                            />
                            <Select
                                label="Range"
                                value={range}
                                onChange={value => {
                                    if (value) setRange(value as keyof typeof ranges)
                                    setInspectedIds(null)
                                }}
                                data={Object.keys(ranges)}
                                allowDeselect={false}
                            />
                        </div>
                        <div className="trends-secondary-controls">
                            {savedViews.length > 0 && (
                                <Menu position="bottom-end">
                                    <Menu.Target>
                                        <Button
                                            variant="subtle"
                                            color="gray"
                                            leftSection={<IconBookmark size={16} />}
                                            rightSection={<IconChevronDown size={14} />}
                                        >
                                            Saved views
                                        </Button>
                                    </Menu.Target>
                                    <Menu.Dropdown>
                                        {savedViews.map(view => (
                                            <Menu.Item
                                                key={view.id}
                                                onClick={() => loadView(view.id)}
                                            >
                                                {view.name}
                                            </Menu.Item>
                                        ))}
                                    </Menu.Dropdown>
                                </Menu>
                            )}
                            <Menu position="bottom-end">
                                <Menu.Target>
                                    <Button
                                        variant="subtle"
                                        color="gray"
                                        leftSection={<IconAdjustments size={16} />}
                                        rightSection={<IconChevronDown size={14} />}
                                    >
                                        More
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Label>Aggregation</Menu.Label>
                                    <Menu.Item closeMenuOnClick={false}>
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
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item onClick={() => void saveView()}>
                                        Save current view
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </div>
                    </div>

                    {average !== null && (
                        <div className="trends-summary" aria-label="Trend summary">
                            <div>
                                <Text size="xs" c="dimmed">
                                    Average
                                </Text>
                                <Text fw={750} size="xl">
                                    {formatDisplayValue(average)}
                                </Text>
                            </div>
                            <div>
                                <Text size="xs" c="dimmed">
                                    vs previous {range.toLowerCase()}
                                </Text>
                                <Text fw={700}>
                                    {periodChange === null
                                        ? 'Not enough prior data'
                                        : formatDisplayValue(periodChange, { signed: true })}
                                </Text>
                            </div>
                            <div>
                                <Text size="xs" c="dimmed">
                                    Coverage
                                </Text>
                                <div className="trends-coverage-value">
                                    <Text fw={700}>
                                        {coveredValues.length} / {points.length}{' '}
                                        {granularity === 'weekly' ? 'weeks' : 'days'}
                                    </Text>
                                    <Badge
                                        size="xs"
                                        color={
                                            coverageRatio >= 0.75
                                                ? 'teal'
                                                : coverageRatio >= 0.4
                                                  ? 'yellow'
                                                  : 'gray'
                                        }
                                    >
                                        {confidence}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    )}

                    {!loading && coveredValues.length === 0 ? (
                        <div className="trend-metric-empty">
                            <Text fw={650}>
                                No {definitionId ? metricLabel(definitionId).toLowerCase() : 'metric'}{' '}
                                data in this range
                            </Text>
                            <Text size="sm" c="dimmed">
                                {isNutritionMetric
                                    ? 'This trend will appear after meals containing this nutrient are recorded.'
                                    : isManualMetric
                                      ? 'Use Log to add an observation for this metric.'
                                      : 'This trend will appear after observations are synced from a connection.'}
                            </Text>
                            {!isManualMetric && (
                                <Button
                                    size="xs"
                                    variant="default"
                                    onClick={() =>
                                        navigate(
                                            isNutritionMetric
                                                ? '/journal?category=Meals'
                                                : '/settings/connections',
                                        )
                                    }
                                >
                                    {isNutritionMetric ? 'View meals in Journal' : 'Review connections'}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <TrendChart
                            points={points}
                            loading={loading}
                            error={error && !isNutritionMetric}
                            metric={definitionId ? metricLabel(definitionId) : ''}
                            onInspect={isNutritionMetric ? undefined : setInspectedIds}
                            comparisonPoints={
                                comparisonDefinitionId ? comparisonPoints : undefined
                            }
                            comparisonLabel={
                                comparisonDefinitionId
                                    ? metricLabel(comparisonDefinitionId)
                                    : undefined
                            }
                            periodLabel={granularity === 'weekly' ? 'week' : 'day'}
                            valueLabel={
                                definitionId && displayUnit
                                    ? `${metricLabel(definitionId)} (${unitPresentation(displayUnit).label})`
                                    : undefined
                            }
                            formatValue={value =>
                                formatDisplayValue(value, { withUnit: false })
                            }
                        />
                    )}

                    <div className="trends-below-chart">
                        {!showCompare ? (
                            <Button
                                variant="default"
                                onClick={() => {
                                    setShowCompare(true)
                                    setShowAnalysis(false)
                                }}
                            >
                                Compare another metric
                            </Button>
                        ) : (
                            <Select
                                className="trend-compare"
                                clearable
                                label="Compare with"
                                value={comparisonDefinitionId}
                                onChange={value => {
                                    setComparisonDefinitionId(value)
                                    setShowAnalysis(false)
                                }}
                                data={recordedDefinitionIds
                                    .filter(id => id !== definitionId)
                                    .map(id => ({ value: id, label: metricLabel(id) }))}
                                placeholder="Choose a recorded metric"
                            />
                        )}
                        {showCompare && comparisonDefinitionId && (
                            <Button
                                variant="subtle"
                                color="gray"
                                onClick={() => setShowAnalysis(value => !value)}
                            >
                                {showAnalysis ? 'Hide analysis' : 'Analyze relationship'}
                            </Button>
                        )}
                    </div>

                    {showAnalysis && definitionId && comparisonDefinitionId && (
                        <div className="trends-analysis">
                            <CorrelationNote
                                observations={observations}
                                metric={definitionId}
                                comparisonMetric={comparisonDefinitionId}
                                start={currentStart}
                                days={days}
                                timezone={timezone}
                            />
                        </div>
                    )}

                    {actionError && (
                        <Alert role="alert" color="orange">
                            {actionError}
                        </Alert>
                    )}

                    {inspectedIds && definitionId && (
                        <div className="trends-inspector">
                            <div className="trends-inspector-heading">
                                <div>
                                    <Text fw={700}>Contributing observations</Text>
                                    <Text size="sm" c="dimmed">
                                        These are the records behind the selected chart point.
                                    </Text>
                                </div>
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    color="gray"
                                    onClick={() => setInspectedIds(null)}
                                >
                                    Close
                                </Button>
                            </div>
                            <ObservationRecords
                                observations={observations.filter(
                                    record =>
                                        record.definitionId === definitionId &&
                                        inspectedIds.includes(record.id),
                                )}
                                onToggleExcluded={observation => void toggleExcluded(observation)}
                                showAll
                            />
                        </div>
                    )}

                    <Text size="xs" c="dimmed" className="trends-footnote">
                        Missing periods are shown rather than estimated. Summary values use only
                        periods that contain observations.
                    </Text>
                </section>
            )}
        </div>
    )
}
