import { Alert, Badge, Button, Menu, SegmentedControl, Select, Text } from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    IconAdjustments,
    IconBookmark,
    IconChartLine,
    IconChevronDown,
    IconPlugConnected,
} from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
    addCalendarDays,
    calendarDateFromKey,
    calendarDayRangeForKey,
    calendarTodayKey,
} from '@trackit/domain/calendar'
import {
    dailySeries,
    weeklySeries,
    type NumericObservation,
    type TrendGranularity,
} from '@trackit/domain/health'
import { metricDefinition } from '@trackit/domain/metricCatalog'
import {
    convertMetricValue,
    displayUnitFor,
    formatMetricDisplayValue,
    unitPresentation,
} from '@trackit/domain/metrics'
import { CorrelationNote } from '../components/CorrelationNote'
import { ObservationRecords } from '../components/ObservationRecords'
import { PageHeader } from '../components/PageHeader'
import { TrendChart } from '../components/TrendChart'
import { useServerData } from '../hooks/useServerData'
import { listDailyMetrics } from '../lib/dailyMetricApi'
import { healthQueryKeys } from '../lib/healthQueries'
import { listObservations, setObservationExcluded } from '../lib/observationApi'
import { serverQueryKeys } from '../lib/serverQueries'
import { listTrendViews, saveTrendView, type TrendViewRecord } from '../lib/trendApi'
import '../trends.css'

const ranges = { '7 days': 7, '30 days': 30, '90 days': 90 } as const

const metricLabel = (definitionId: string) =>
    metricDefinition(definitionId)?.name ??
    definitionId.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())

export function Trends() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [params, setParams] = useSearchParams()
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const todayKey = calendarTodayKey(timezone)
    const requestedMetric = params.get('metric')
    const [range, setRange] = useState<keyof typeof ranges>('30 days')
    const [definitionId, setDefinitionIdState] = useState<string | null>(requestedMetric)
    const [comparisonDefinitionId, setComparisonDefinitionId] = useState<string | null>(null)
    const [showCompare, setShowCompare] = useState(false)
    const [showAnalysis, setShowAnalysis] = useState(false)
    const [granularity, setGranularity] = useState<TrendGranularity>('daily')
    const [inspectedIds, setInspectedIds] = useState<string[] | null>(null)
    const availableRange = { from: addCalendarDays(todayKey, -179), to: todayKey }
    const availableMetricsQuery = useQuery({
        queryKey: [...healthQueryKeys.dailyMetrics, availableRange],
        queryFn: ({ signal }) => listDailyMetrics(availableRange, signal),
    })
    const savedViewsQuery = useQuery({
        queryKey: serverQueryKeys.trendViews,
        queryFn: () => listTrendViews(),
    })
    const availableMetrics = availableMetricsQuery.data ?? []
    const savedViews = savedViewsQuery.data ?? []
    const recordedDefinitionIds = useMemo(
        () => [...new Set(availableMetrics.map(record => record.definitionId))],
        [availableMetrics],
    )
    const preferredDefinitionId = ['sleep', 'steps', 'weight', 'resting_heart_rate', 'energy'].find(
        candidate => recordedDefinitionIds.includes(candidate),
    )
    const activeDefinitionId =
        definitionId && recordedDefinitionIds.includes(definitionId)
            ? definitionId
            : requestedMetric && recordedDefinitionIds.includes(requestedMetric)
              ? requestedMetric
              : (preferredDefinitionId ?? recordedDefinitionIds[0] ?? null)
    const days = ranges[range]
    const observationFromKey = addCalendarDays(todayKey, -(days * 2 - 1))
    const observationRange = {
        from: calendarDayRangeForKey(observationFromKey, timezone).from.toISOString(),
        to: calendarDayRangeForKey(todayKey, timezone).to.toISOString(),
        definitionIds: activeDefinitionId
            ? [activeDefinitionId, ...(comparisonDefinitionId ? [comparisonDefinitionId] : [])]
            : [],
    }
    const observationsQuery = useQuery({
        queryKey: [...healthQueryKeys.observations, observationRange],
        enabled: Boolean(activeDefinitionId) && !availableMetricsQuery.isPending,
        queryFn: ({ signal }) => listObservations(observationRange, signal),
    })
    const observations = observationsQuery.data ?? []
    const loading =
        availableMetricsQuery.isPending ||
        (Boolean(activeDefinitionId) && observationsQuery.isPending)
    const error = availableMetricsQuery.isError || observationsQuery.isError

    const setDefinitionId = (value: string | null) => {
        setDefinitionIdState(value)
        const next = new URLSearchParams(params)
        if (value) next.set('metric', value)
        else next.delete('metric')
        setParams(next, { replace: true })
    }

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
        ? displayUnitFor(activeDefinitionId, preferences?.metricPreferences, preferences?.units)
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
    const formatDisplayValue = (
        value: number,
        options?: { signed?: boolean; withUnit?: boolean },
    ) =>
        activeDefinitionId && displayUnit
            ? formatMetricDisplayValue(
                  activeDefinitionId,
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
    const isNutritionMetric = activeDefinitionId
        ? metricDefinition(activeDefinitionId)?.source === 'meal'
        : false
    const isManualMetric = activeDefinitionId
        ? metricDefinition(activeDefinitionId)?.source === 'manual'
        : false

    const excludeMutation = useMutation({
        mutationFn: ({
            observation,
            excluded,
        }: {
            observation: NumericObservation
            excluded: boolean
        }) => setObservationExcluded(observation, excluded),
    })
    const saveViewMutation = useMutation({
        mutationFn: async () => {
            if (!activeDefinitionId) throw new Error('No metric selected')
            return saveTrendView({
                name: `${metricLabel(activeDefinitionId)} · ${range}`,
                definitionId: activeDefinitionId,
                comparisonDefinitionId: comparisonDefinitionId ?? undefined,
                rangeDays: days,
                granularity,
            })
        },
        onSuccess: saved => {
            queryClient.setQueryData<TrendViewRecord[]>(serverQueryKeys.trendViews, current => [
                saved,
                ...(current ?? []).filter(view => view.id !== saved.id),
            ])
        },
    })
    const actionError =
        excludeMutation.submittedAt >= saveViewMutation.submittedAt
            ? excludeMutation.isError
                ? 'The observation could not be updated. Try again.'
                : ''
            : saveViewMutation.isError
              ? 'The trend view could not be saved. Try again.'
              : ''

    const loadView = (id: string) => {
        const view = savedViews.find(item => item.id === id)
        if (!view) return
        setDefinitionId(view.definitionId)
        setComparisonDefinitionId(view.comparisonDefinitionId)
        setShowCompare(Boolean(view.comparisonDefinitionId))
        setShowAnalysis(false)
        setGranularity(view.granularity)
        setInspectedIds(null)
        const nextRange = Object.entries(ranges).find(([, value]) => value === view.rangeDays)?.[0]
        if (nextRange) setRange(nextRange as keyof typeof ranges)
    }

    const pageEmpty =
        !loading && (availableMetricsQuery.isError || recordedDefinitionIds.length === 0)
    const rangeUnavailable = Boolean(activeDefinitionId) && observationsQuery.isError
    const rangeEmpty = !loading && !rangeUnavailable && coveredValues.length === 0

    return (
        <div className="page-content trends-page trends-revamp">
            <PageHeader title="Trends" description="See how your observations change over time." />

            {pageEmpty ? (
                <section className="panel page-empty">
                    <IconChartLine size={28} />
                    <h2>
                        {availableMetricsQuery.isError
                            ? 'Trends are unavailable'
                            : 'No trends to show yet'}
                    </h2>
                    <Text c="dimmed" size="sm">
                        {availableMetricsQuery.isError
                            ? 'TrackIt could not load your observations. Review the server and connection status.'
                            : 'Trends appear after observations have been recorded or imported.'}
                    </Text>
                    <Button
                        leftSection={<IconPlugConnected size={17} />}
                        onClick={() => navigate('/settings/connections')}
                    >
                        Review Connections
                    </Button>
                </section>
            ) : (
                <section className="panel chart-large trends-surface">
                    <div className="trends-toolbar">
                        <div className="trends-primary-controls">
                            <Select
                                label="Metric"
                                aria-label="Trend metric"
                                value={activeDefinitionId}
                                onChange={value => {
                                    setDefinitionId(value)
                                    if (value === comparisonDefinitionId)
                                        setComparisonDefinitionId(null)
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
                                    <Menu.Item
                                        disabled={saveViewMutation.isPending}
                                        onClick={() => saveViewMutation.mutate()}
                                    >
                                        Save current view
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </div>
                    </div>

                    {savedViewsQuery.isError && (
                        <Alert color="orange">Saved trend views could not be loaded.</Alert>
                    )}

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

                    {rangeUnavailable ? (
                        <Alert color="orange">
                            Trend observations for this range could not be loaded.
                        </Alert>
                    ) : rangeEmpty ? (
                        <div className="trend-metric-empty">
                            <Text fw={650}>
                                No{' '}
                                {activeDefinitionId
                                    ? metricLabel(activeDefinitionId).toLowerCase()
                                    : 'metric'}{' '}
                                data in this range
                            </Text>
                            <Text size="sm" c="dimmed">
                                {isNutritionMetric
                                    ? 'This trend will appear after meals containing this nutrient are recorded.'
                                    : isManualMetric
                                      ? 'Use Log to add an observation for this metric.'
                                      : 'This trend will appear after observations are imported from a Connection.'}
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
                                    {isNutritionMetric
                                        ? 'View meals in Journal'
                                        : 'Review Connections'}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <TrendChart
                            points={points}
                            loading={loading}
                            error={error}
                            metric={activeDefinitionId ? metricLabel(activeDefinitionId) : ''}
                            onInspect={isNutritionMetric ? undefined : setInspectedIds}
                            comparisonPoints={comparisonDefinitionId ? comparisonPoints : undefined}
                            comparisonLabel={
                                comparisonDefinitionId
                                    ? metricLabel(comparisonDefinitionId)
                                    : undefined
                            }
                            periodLabel={granularity === 'weekly' ? 'week' : 'day'}
                            valueLabel={
                                activeDefinitionId && displayUnit
                                    ? `${metricLabel(activeDefinitionId)} (${unitPresentation(displayUnit).label})`
                                    : undefined
                            }
                            formatValue={value => formatDisplayValue(value, { withUnit: false })}
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
                                    .filter(id => id !== activeDefinitionId)
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

                    {showAnalysis && activeDefinitionId && comparisonDefinitionId && (
                        <div className="trends-analysis">
                            <CorrelationNote
                                observations={observations}
                                metric={activeDefinitionId}
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

                    {inspectedIds && activeDefinitionId && (
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
                                        record.definitionId === activeDefinitionId &&
                                        inspectedIds.includes(record.id),
                                )}
                                onToggleExcluded={observation =>
                                    excludeMutation.mutate({
                                        observation,
                                        excluded: !observation.excluded,
                                    })
                                }
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
