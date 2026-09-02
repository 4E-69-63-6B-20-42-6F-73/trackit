import { Alert, Badge, Button, Menu, SegmentedControl, Select, Text } from '@mantine/core'
import {
    IconAdjustments,
    IconBookmark,
    IconChartLine,
    IconChevronDown,
    IconPlugConnected,
} from '@tabler/icons-react'
import type { DailyPoint, NumericObservation, TrendGranularity } from '@trackit/domain/health'
import { CorrelationNote } from '../components/CorrelationNote'
import { ObservationRecords } from '../components/ObservationRecords'
import { PageHeader } from '../components/PageHeader'
import { TrendChart } from '../components/TrendChart'
import { metricLabel, type TrendRangeLabel } from './trendsModel'

type MetricOptionGroup = {
    group: string
    items: Array<{ value: string; label: string }>
}

type SavedTrendViewOption = { id: string; name: string }

export type TrendsViewProps = {
    pageEmpty: boolean
    availableMetricsError: boolean
    recordedDefinitionIds: string[]
    savedViews: SavedTrendViewOption[]
    savedViewsError: boolean
    metricOptions: MetricOptionGroup[]
    activeDefinitionId: string | null
    range: TrendRangeLabel
    granularity: TrendGranularity
    average: number | null
    periodChange: number | null
    coveredCount: number
    pointCount: number
    coverageRatio: number
    confidence: string
    rangeUnavailable: boolean
    rangeEmpty: boolean
    isNutritionMetric: boolean
    isManualMetric: boolean
    points: DailyPoint[]
    comparisonPoints: DailyPoint[]
    loading: boolean
    error: boolean
    comparisonDefinitionId: string | null
    showCompare: boolean
    showAnalysis: boolean
    observations: NumericObservation[]
    currentStart: Date
    days: number
    timezone: string
    actionError: string
    inspectedIds: string[] | null
    inspectedObservations: NumericObservation[]
    saveViewPending: boolean
    valueLabel?: string
    formatDisplayValue: (
        value: number,
        options?: { signed?: boolean; withUnit?: boolean },
    ) => string
    onReviewConnections: () => void
    onMetricChange: (value: string | null) => void
    onRangeChange: (value: TrendRangeLabel) => void
    onLoadView: (id: string) => void
    onGranularityChange: (value: TrendGranularity) => void
    onSaveView: () => void
    onReviewEmptyRange: () => void
    onInspect: (ids: string[]) => void
    onShowCompare: () => void
    onComparisonChange: (value: string | null) => void
    onToggleAnalysis: () => void
    onCloseInspector: () => void
    onToggleExcluded: (observation: NumericObservation) => void
}

function TrendSummary({
    average,
    periodChange,
    range,
    coveredCount,
    pointCount,
    granularity,
    coverageRatio,
    confidence,
    formatDisplayValue,
}: Pick<
    TrendsViewProps,
    | 'average'
    | 'periodChange'
    | 'range'
    | 'coveredCount'
    | 'pointCount'
    | 'granularity'
    | 'coverageRatio'
    | 'confidence'
    | 'formatDisplayValue'
>) {
    if (average === null) return null
    return (
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
                        {coveredCount} / {pointCount} {granularity === 'weekly' ? 'weeks' : 'days'}
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
    )
}

export function TrendsView(props: TrendsViewProps) {
    const {
        pageEmpty,
        availableMetricsError,
        recordedDefinitionIds,
        savedViews,
        savedViewsError,
        metricOptions,
        activeDefinitionId,
        range,
        granularity,
        average,
        periodChange,
        coveredCount,
        pointCount,
        coverageRatio,
        confidence,
        rangeUnavailable,
        rangeEmpty,
        isNutritionMetric,
        isManualMetric,
        points,
        comparisonPoints,
        loading,
        error,
        comparisonDefinitionId,
        showCompare,
        showAnalysis,
        observations,
        currentStart,
        days,
        timezone,
        actionError,
        inspectedIds,
        inspectedObservations,
        saveViewPending,
        valueLabel,
        formatDisplayValue,
        onReviewConnections,
        onMetricChange,
        onRangeChange,
        onLoadView,
        onGranularityChange,
        onSaveView,
        onReviewEmptyRange,
        onInspect,
        onShowCompare,
        onComparisonChange,
        onToggleAnalysis,
        onCloseInspector,
        onToggleExcluded,
    } = props

    return (
        <div className="page-content trends-page trends-revamp">
            <PageHeader title="Trends" description="See how your observations change over time." />

            {pageEmpty ? (
                <section className="panel page-empty">
                    <IconChartLine size={28} />
                    <h2>
                        {availableMetricsError ? 'Trends are unavailable' : 'No trends to show yet'}
                    </h2>
                    <Text c="dimmed" size="sm">
                        {availableMetricsError
                            ? 'TrackIt could not load your observations. Review the server and connection status.'
                            : 'Trends appear after observations have been recorded or imported.'}
                    </Text>
                    <Button
                        leftSection={<IconPlugConnected size={17} />}
                        onClick={onReviewConnections}
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
                                onChange={onMetricChange}
                                data={metricOptions}
                                allowDeselect={false}
                            />
                            <Select
                                label="Range"
                                value={range}
                                onChange={value => value && onRangeChange(value as TrendRangeLabel)}
                                data={['7 days', '30 days', '90 days']}
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
                                                onClick={() => onLoadView(view.id)}
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
                                            onChange={value =>
                                                onGranularityChange(value as TrendGranularity)
                                            }
                                        />
                                    </Menu.Item>
                                    <Menu.Divider />
                                    <Menu.Item disabled={saveViewPending} onClick={onSaveView}>
                                        Save current view
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </div>
                    </div>

                    {savedViewsError && (
                        <Alert color="orange">Saved trend views could not be loaded.</Alert>
                    )}

                    <TrendSummary
                        average={average}
                        periodChange={periodChange}
                        range={range}
                        coveredCount={coveredCount}
                        pointCount={pointCount}
                        granularity={granularity}
                        coverageRatio={coverageRatio}
                        confidence={confidence}
                        formatDisplayValue={formatDisplayValue}
                    />

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
                                <Button size="xs" variant="default" onClick={onReviewEmptyRange}>
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
                            onInspect={isNutritionMetric ? undefined : onInspect}
                            comparisonPoints={comparisonDefinitionId ? comparisonPoints : undefined}
                            comparisonLabel={
                                comparisonDefinitionId
                                    ? metricLabel(comparisonDefinitionId)
                                    : undefined
                            }
                            periodLabel={granularity === 'weekly' ? 'week' : 'day'}
                            valueLabel={valueLabel}
                            formatValue={value => formatDisplayValue(value, { withUnit: false })}
                        />
                    )}

                    <div className="trends-below-chart">
                        {!showCompare ? (
                            <Button variant="default" onClick={onShowCompare}>
                                Compare another metric
                            </Button>
                        ) : (
                            <Select
                                className="trend-compare"
                                clearable
                                label="Compare with"
                                value={comparisonDefinitionId}
                                onChange={onComparisonChange}
                                data={recordedDefinitionIds
                                    .filter(id => id !== activeDefinitionId)
                                    .map(id => ({ value: id, label: metricLabel(id) }))}
                                placeholder="Choose a recorded metric"
                            />
                        )}
                        {showCompare && comparisonDefinitionId && (
                            <Button variant="subtle" color="gray" onClick={onToggleAnalysis}>
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
                                    onClick={onCloseInspector}
                                >
                                    Close
                                </Button>
                            </div>
                            <ObservationRecords
                                observations={inspectedObservations}
                                onToggleExcluded={onToggleExcluded}
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
