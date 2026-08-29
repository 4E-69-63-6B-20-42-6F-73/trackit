import { Alert, Text } from '@mantine/core'
import { IconCircleCheck } from '@tabler/icons-react'
import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip as ChartTooltip,
    XAxis,
    YAxis,
} from 'recharts'
import type { DailyPoint } from '../domain/health'

const indexedSeries = (values: DailyPoint[]) => {
    const baseline = values.find(point => point.value !== null && point.value !== 0)?.value ?? null
    if (baseline === null) return values.map(() => null)
    return values.map(point => (point.value === null ? null : (point.value / baseline) * 100))
}

export function TrendChart({
    points,
    loading,
    error,
    metric,
    onInspect,
    comparisonPoints,
    comparisonLabel,
    periodLabel = 'day',
    valueLabel,
    formatValue,
}: {
    points: DailyPoint[]
    loading: boolean
    error: boolean
    metric: string
    onInspect?: (recordIds: string[]) => void
    comparisonPoints?: DailyPoint[]
    comparisonLabel?: string
    periodLabel?: 'day' | 'week'
    valueLabel?: string
    formatValue?: (value: number) => string
}) {
    if (loading)
        return <div role="status" aria-label="Loading trend" className="trend-chart-loading" />
    if (error) return <Alert color="orange">Connect to TrackIt to load your observations.</Alert>

    const covered = points.filter(point => point.value !== null)
    if (!covered.length) return <Alert>No {metric} records exist in this date range.</Alert>

    const compared = Boolean(comparisonPoints?.some(point => point.value !== null))
    const indexedPrimary = compared ? indexedSeries(points) : []
    const indexedComparison = compared ? indexedSeries(comparisonPoints!) : []
    const chartData = points.map((point, index) => ({
        ...point,
        primary: compared ? indexedPrimary[index] : point.value,
        comparison: compared ? indexedComparison[index] : null,
    }))

    return (
        <>
            {!compared && valueLabel && (
                <Text size="xs" c="dimmed" fw={600}>
                    {valueLabel}
                </Text>
            )}
            <div className={onInspect ? 'trend-chart trend-chart--interactive' : 'trend-chart'}>
                <ResponsiveContainer width="100%" height={330}>
                    <LineChart
                        data={chartData}
                        margin={{ top: 24, right: 15, left: -10, bottom: 0 }}
                        onClick={state => {
                            if (!onInspect) return
                            const active = state as unknown as {
                                activePayload?: Array<{ payload?: { recordIds?: string[] } }>
                            }
                            const recordIds = active.activePayload?.[0]?.payload?.recordIds
                            if (recordIds?.length) onInspect(recordIds)
                        }}
                    >
                        <CartesianGrid vertical={false} stroke="#ebe9e1" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            domain={compared ? ['auto', 'auto'] : undefined}
                            tickFormatter={
                                compared ? value => `${Math.round(Number(value))}` : formatValue
                            }
                        />
                        <ChartTooltip
                            formatter={
                                compared
                                    ? value => `${Number(value).toFixed(1)} index`
                                    : !formatValue
                                      ? undefined
                                      : value => formatValue(Number(value))
                            }
                        />
                        <Line
                            type="monotone"
                            dataKey="primary"
                            name={compared ? metric : (valueLabel ?? metric)}
                            connectNulls={false}
                            stroke="#4f61a8"
                            strokeWidth={3}
                        />
                        {compared && (
                            <Line
                                type="monotone"
                                dataKey="comparison"
                                name={comparisonLabel}
                                connectNulls={false}
                                stroke="#b06b38"
                                strokeWidth={2}
                            />
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            {compared && (
                <Text size="xs" c="dimmed">
                    Both series are indexed to 100 at their first non-zero recorded value in this
                    period. An index of 105 means roughly 5% above that baseline.
                </Text>
            )}
            <div className="chart-note trend-chart-note">
                <IconCircleCheck size={18} />
                <Text size="sm">
                    <strong>
                        {covered.length} covered {periodLabel}
                        {covered.length === 1 ? '' : 's'}.
                    </strong>{' '}
                    Missing {periodLabel}s are left blank.
                    {onInspect && ` Select a chart point to inspect the observations behind it.`}
                    {periodLabel === 'week' &&
                        ' Partial weeks use only the days that actually contain observations.'}
                </Text>
            </div>
        </>
    )
}
