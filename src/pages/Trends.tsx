import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { addCalendarDays, calendarTodayKey } from '@trackit/domain/calendar'
import type { NumericObservation, TrendGranularity } from '@trackit/domain/health'
import { unitPresentation } from '@trackit/domain/metrics'
import { useServerData } from '../hooks/useServerData'
import { listDailyMetrics } from '../lib/dailyMetricApi'
import { healthQueryKeys } from '../lib/healthQueries'
import { listObservations, setObservationExcluded } from '../lib/observationApi'
import { serverQueryKeys } from '../lib/serverQueries'
import { listTrendViews, saveTrendView, type TrendViewRecord } from '../lib/trendApi'
import { TrendsView } from './TrendsView'
import {
    buildTrendPresentation,
    formatTrendValue,
    metricLabel,
    metricOptionsFor,
    recordedMetricIds,
    resolveActiveMetric,
    trendObservationRange,
    trendRanges,
    type TrendRangeLabel,
} from './trendsModel'
import '../trends.css'

export function Trends() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [params, setParams] = useSearchParams()
    const { preferences } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const todayKey = calendarTodayKey(timezone)
    const requestedMetric = params.get('metric')
    const [range, setRange] = useState<TrendRangeLabel>('30 days')
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
    const availableMetrics = useMemo(
        () => availableMetricsQuery.data ?? [],
        [availableMetricsQuery.data],
    )
    const savedViews = savedViewsQuery.data ?? []
    const recordedDefinitionIds = useMemo(
        () => recordedMetricIds(availableMetrics),
        [availableMetrics],
    )
    const activeDefinitionId = resolveActiveMetric(
        definitionId,
        requestedMetric,
        recordedDefinitionIds,
    )
    const days = trendRanges[range]
    const observationDefinitionIds = activeDefinitionId
        ? [activeDefinitionId, ...(comparisonDefinitionId ? [comparisonDefinitionId] : [])]
        : []
    const observationRange = trendObservationRange(
        todayKey,
        days,
        timezone,
        observationDefinitionIds,
    )
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
    const metricOptions = useMemo(
        () => metricOptionsFor(recordedDefinitionIds),
        [recordedDefinitionIds],
    )
    const presentation = buildTrendPresentation({
        observations,
        activeDefinitionId,
        comparisonDefinitionId,
        granularity,
        days,
        todayKey,
        timezone,
        metricPreferences: preferences?.metricPreferences,
    })

    const setDefinitionId = (value: string | null) => {
        setDefinitionIdState(value)
        const next = new URLSearchParams(params)
        if (value) next.set('metric', value)
        else next.delete('metric')
        setParams(next, { replace: true })
    }

    const formatDisplayValue = (
        value: number,
        options?: { signed?: boolean; withUnit?: boolean },
    ) =>
        formatTrendValue(
            activeDefinitionId,
            presentation.displayUnit,
            value,
            preferences?.metricPreferences,
            preferences?.locale,
            options,
        )

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
        const nextRange = Object.entries(trendRanges).find(([, value]) => value === view.rangeDays)?.[0]
        if (nextRange) setRange(nextRange as TrendRangeLabel)
    }

    const pageEmpty =
        !loading && (availableMetricsQuery.isError || recordedDefinitionIds.length === 0)
    const rangeUnavailable = Boolean(activeDefinitionId) && observationsQuery.isError
    const rangeEmpty = !loading && !rangeUnavailable && presentation.coveredCount === 0
    const inspectedObservations =
        inspectedIds && activeDefinitionId
            ? observations.filter(
                  record =>
                      record.definitionId === activeDefinitionId && inspectedIds.includes(record.id),
              )
            : []
    const valueLabel =
        activeDefinitionId && presentation.displayUnit
            ? `${metricLabel(activeDefinitionId)} (${unitPresentation(presentation.displayUnit).label})`
            : undefined

    return (
        <TrendsView
            pageEmpty={pageEmpty}
            availableMetricsError={availableMetricsQuery.isError}
            recordedDefinitionIds={recordedDefinitionIds}
            savedViews={savedViews}
            savedViewsError={savedViewsQuery.isError}
            metricOptions={metricOptions}
            activeDefinitionId={activeDefinitionId}
            range={range}
            granularity={granularity}
            average={presentation.average}
            periodChange={presentation.periodChange}
            coveredCount={presentation.coveredCount}
            pointCount={presentation.pointCount}
            coverageRatio={presentation.coverageRatio}
            confidence={presentation.confidence}
            rangeUnavailable={rangeUnavailable}
            rangeEmpty={rangeEmpty}
            isNutritionMetric={presentation.isNutritionMetric}
            isManualMetric={presentation.isManualMetric}
            points={presentation.points}
            comparisonPoints={presentation.comparisonPoints}
            loading={loading}
            error={error}
            comparisonDefinitionId={comparisonDefinitionId}
            showCompare={showCompare}
            showAnalysis={showAnalysis}
            observations={observations}
            currentStart={presentation.currentStart}
            days={days}
            timezone={timezone}
            actionError={actionError}
            inspectedIds={inspectedIds}
            inspectedObservations={inspectedObservations}
            saveViewPending={saveViewMutation.isPending}
            valueLabel={valueLabel}
            formatDisplayValue={formatDisplayValue}
            onReviewConnections={() => navigate('/settings/connections')}
            onMetricChange={value => {
                setDefinitionId(value)
                if (value === comparisonDefinitionId) setComparisonDefinitionId(null)
                setInspectedIds(null)
                setShowAnalysis(false)
            }}
            onRangeChange={value => {
                setRange(value)
                setInspectedIds(null)
            }}
            onLoadView={loadView}
            onGranularityChange={value => {
                setGranularity(value)
                setInspectedIds(null)
            }}
            onSaveView={() => saveViewMutation.mutate()}
            onReviewEmptyRange={() =>
                navigate(
                    presentation.isNutritionMetric
                        ? '/journal?category=Meals'
                        : '/settings/connections',
                )
            }
            onInspect={setInspectedIds}
            onShowCompare={() => {
                setShowCompare(true)
                setShowAnalysis(false)
            }}
            onComparisonChange={value => {
                setComparisonDefinitionId(value)
                setShowAnalysis(false)
            }}
            onToggleAnalysis={() => setShowAnalysis(value => !value)}
            onCloseInspector={() => setInspectedIds(null)}
            onToggleExcluded={observation =>
                excludeMutation.mutate({ observation, excluded: !observation.excluded })
            }
        />
    )
}
