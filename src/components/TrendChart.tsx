import { Alert, Button, Group, Skeleton, Text } from '@mantine/core'
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

export function TrendChart({
    points,
    loading,
    error,
    metric,
    onInspect,
    comparisonPoints,
    comparisonLabel,
    periodLabel = 'day',
}: {
    points: DailyPoint[]
    loading: boolean
    error: boolean
    metric: string
    onInspect?: (recordIds: string[]) => void
    comparisonPoints?: DailyPoint[]
    comparisonLabel?: string
    periodLabel?: 'day' | 'week'
}) {
    if (loading) return <Skeleton role="status" aria-label="Loading trend" height={280} radius="md" />
    if (error) return <Alert color="orange">Connect to TrackIt to load your observations.</Alert>
    const covered = points.filter(point => point.value !== null)
    if (!covered.length) return <Alert>No {metric} records exist in this date range.</Alert>
    const normalize = (values: DailyPoint[]) => {
        const numbers = values.flatMap(point => (point.value === null ? [] : [point.value]))
        const min = Math.min(...numbers)
        const spread = Math.max(...numbers) - min
        return values.map(point =>
            point.value === null ? null : spread ? ((point.value - min) / spread) * 100 : 50,
        )
    }
    const compared = Boolean(comparisonPoints?.some(point => point.value !== null))
    const normalizedPrimary = compared ? normalize(points) : []
    const normalizedComparison = compared ? normalize(comparisonPoints!) : []
    const chartData = points.map((point, index) => ({
        ...point,
        primary: compared ? normalizedPrimary[index] : point.value,
        comparison: compared ? normalizedComparison[index] : null,
    }))
    return (
        <>
            <ResponsiveContainer width="100%" height={310}>
                <LineChart data={chartData} margin={{ top: 25, right: 15, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#ebe9e1" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <ChartTooltip />
                    <Line
                        type="monotone"
                        dataKey="primary"
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
            {compared && (
                <Text size="xs" c="dimmed">
                    Both series are normalized to their own 0–100 range so differently-sized units
                    can be compared.
                </Text>
            )}
            {onInspect && (
                <Group gap="xs" aria-label={`Contributing records by ${periodLabel}`}>
                    {covered.map(point => (
                        <Button
                            key={point.date}
                            size="compact-xs"
                            variant="subtle"
                            onClick={() => onInspect(point.recordIds)}
                        >
                            {point.date}: inspect {point.recordIds.length}
                            {point.totalDays
                                ? ` (${point.coveredDays}/${point.totalDays} days recorded)`
                                : ''}
                        </Button>
                    ))}
                </Group>
            )}
            <div className="chart-note">
                <IconCircleCheck size={18} />
                <Text size="sm">
                    <strong>
                        {covered.length} covered {periodLabel}
                        {covered.length === 1 ? '' : 's'}.
                    </strong>{' '}
                    Missing {periodLabel}s are left blank.
                    {onInspect &&
                        ` Select a covered ${periodLabel} to inspect exactly which records contributed.`}
                    {periodLabel === 'week' &&
                        ' Partial weeks show their recorded-day coverage and use only those days.'}
                </Text>
            </div>
        </>
    )
}
