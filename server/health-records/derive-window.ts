export type DailyMetricValue = {
    date: string
    metric: string
    value: number
    unit: string
}

export type WindowDerivedMetric = {
    metric: string
    value: number
    unit: string
    observedAt: string
    kind: 'derived_metric'
    derivation: string
    derivationVersion: number
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const median = (values: number[]) => {
    const ordered = [...values].sort((a, b) => a - b)
    const middle = Math.floor(ordered.length / 2)
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

function since(asOf: Date, days: number) {
    return new Date(asOf.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10)
}

/** Cross-record derivations consume aggregates, never individual source payloads. */
export function deriveWindowMetrics(rows: DailyMetricValue[], asOf: Date): WindowDerivedMetric[] {
    const observedAt = asOf.toISOString()
    const result: WindowDerivedMetric[] = []
    const stepValues = rows
        .filter(row => row.metric === 'steps' && row.date >= since(asOf, 7))
        .map(row => row.value)
    if (stepValues.length)
        result.push({
            metric: 'steps_7d_average',
            value: mean(stepValues),
            unit: 'count',
            observedAt,
            kind: 'derived_metric',
            derivation: 'steps_7d_average',
            derivationVersion: 1,
        })
    const hrvValues = rows
        .filter(row => row.metric === 'hrv_rmssd' && row.date >= since(asOf, 28))
        .map(row => row.value)
    if (hrvValues.length)
        result.push({
            metric: 'hrv_28d_baseline',
            value: median(hrvValues),
            unit: 'ms',
            observedAt,
            kind: 'derived_metric',
            derivation: 'hrv_28d_baseline',
            derivationVersion: 1,
        })
    return result
}
