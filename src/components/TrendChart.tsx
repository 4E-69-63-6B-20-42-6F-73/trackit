import { Alert, Button, Group, Loader, Text } from '@mantine/core'
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
    periodLabel = 'day',
}: {
    points: DailyPoint[]
    loading: boolean
    error: boolean
    metric: string
    onInspect: (recordIds: string[]) => void
    periodLabel?: 'day' | 'week'
}) {
    if (loading) return <Loader role="status" aria-label="Loading trend" />
    if (error) return <Alert color="orange">Connect to TrackIt to load your observations.</Alert>
    const covered = points.filter(point => point.value !== null)
    if (!covered.length) return <Alert>No {metric} records exist in this date range.</Alert>
    return (
        <>
            <ResponsiveContainer width="100%" height={310}>
                <LineChart data={points} margin={{ top: 25, right: 15, left: -10, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#ebe9e1" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <ChartTooltip />
                    <Line
                        type="monotone"
                        dataKey="value"
                        connectNulls={false}
                        stroke="#4f61a8"
                        strokeWidth={3}
                    />
                </LineChart>
            </ResponsiveContainer>
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
            <div className="chart-note">
                <IconCircleCheck size={18} />
                <Text size="sm">
                    <strong>
                        {covered.length} covered {periodLabel}
                        {covered.length === 1 ? '' : 's'}.
                    </strong>{' '}
                    Missing {periodLabel}s are left blank. Select a covered {periodLabel} to inspect
                    exactly which records contributed.
                    {periodLabel === 'week' &&
                        ' Partial weeks show their recorded-day coverage and use only those days.'}
                </Text>
            </div>
        </>
    )
}
