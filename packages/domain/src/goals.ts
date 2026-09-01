import { dailyMetricAttributionInstant, type NumericObservation } from './health.js'
import {
    metricDefinition,
    type GoalAggregation,
    type GoalPeriodType,
    type MetricComparison,
} from './metricCatalog.js'

export type GoalPeriod = { type: 'day' } | { type: 'week' } | { type: 'rolling'; days: 7 | 14 | 30 }
export type GoalTarget = { value: number } | { min: number; max: number }
export type Goal = {
    id: string
    definitionId: string
    aggregation: GoalAggregation
    comparator: MetricComparison
    target: GoalTarget
    period: GoalPeriod
    canonicalUnit: string
    effectiveFrom: string
    effectiveTo: string | null
    schedule: { weekdays?: number[] }
}
export type GoalEvaluation = {
    value: number | null
    met: boolean | null
    progress: number | null
    observationCount: number
    periodStart: string
    periodEnd: string
    difference: number | null
}

const parts = (date: Date, timezone: string) =>
    Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(date)
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, Number(part.value)]),
    ) as Record<string, number>
function zonedDateTime(timezone: string, year: number, month: number, day: number) {
    const desired = Date.UTC(year, month - 1, day)
    let instant = desired
    for (let index = 0; index < 3; index += 1) {
        const actual = parts(new Date(instant), timezone)
        instant +=
            desired -
            Date.UTC(
                actual.year,
                actual.month - 1,
                actual.day,
                actual.hour,
                actual.minute,
                actual.second,
            )
    }
    return new Date(instant)
}
const localDayStart = (date: Date, timezone: string) => {
    const value = parts(date, timezone)
    return zonedDateTime(timezone, value.year, value.month, value.day)
}
export function goalPeriodBounds(period: GoalPeriod, now: Date, timezone: string) {
    const end = now
    if (period.type === 'rolling')
        return { start: new Date(end.getTime() - period.days * 86_400_000), end }
    const start = localDayStart(now, timezone)
    if (period.type === 'week') {
        const weekday = weekdayIn(now, timezone)
        start.setUTCDate(start.getUTCDate() - ((weekday + 6) % 7))
    }
    return { start, end }
}
const weekdayIn = (date: Date, timezone: string) =>
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
        new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(date),
    )
export function validateGoal(goal: Omit<Goal, 'id'> | Goal): string[] {
    const errors: string[] = []
    const metric = metricDefinition(goal.definitionId)
    const capabilities = metric?.goalCapabilities
    if (!metric || !capabilities) return ['Metric does not support goals.']
    const periods = capabilities.aggregations[goal.aggregation]
    if (!periods) errors.push('Aggregation is not supported for this metric.')
    if (!capabilities.comparators.includes(goal.comparator))
        errors.push('Comparator is not supported for this metric.')
    if (!periods?.includes(goal.period.type as GoalPeriodType))
        errors.push('Period is not supported for this aggregation.')
    if (goal.period.type === 'rolling' && ![7, 14, 30].includes(goal.period.days))
        errors.push('Rolling period must be 7, 14, or 30 days.')
    if (goal.canonicalUnit !== metric.canonicalUnit)
        errors.push('Goal unit must use the metric canonical unit.')
    if (goal.comparator === 'between') {
        if (
            !('min' in goal.target) ||
            !Number.isFinite(goal.target.min) ||
            !Number.isFinite(goal.target.max) ||
            goal.target.min > goal.target.max
        )
            errors.push('Range minimum must be at or below its maximum.')
    } else if (!('value' in goal.target) || !Number.isFinite(goal.target.value))
        errors.push('Target must be a valid number.')
    if (goal.effectiveTo && new Date(goal.effectiveFrom) > new Date(goal.effectiveTo))
        errors.push('End date must be on or after start date.')
    if (goal.schedule.weekdays?.some(day => !Number.isInteger(day) || day < 0 || day > 6))
        errors.push('Weekdays must be between Sunday and Saturday.')
    return errors
}
export function evaluateGoal(
    goal: Goal,
    observations: NumericObservation[],
    now = new Date(),
    timezone = 'UTC',
): GoalEvaluation {
    const bounds = goalPeriodBounds(goal.period, now, timezone)
    const effectiveFrom = new Date(goal.effectiveFrom).getTime()
    const effectiveTo = goal.effectiveTo ? new Date(goal.effectiveTo).getTime() : Infinity
    const activeNow = now.getTime() >= effectiveFrom && now.getTime() <= effectiveTo
    const qualifying = observations.filter(item => {
        const attributedAt = dailyMetricAttributionInstant(item)
        return (
            activeNow &&
            item.definitionId === goal.definitionId &&
            !item.excluded &&
            attributedAt.getTime() >= bounds.start.getTime() &&
            attributedAt.getTime() <= bounds.end.getTime() &&
            (!goal.schedule.weekdays?.length ||
                goal.schedule.weekdays.includes(weekdayIn(attributedAt, timezone)))
        )
    })
    const ordered = [...qualifying].sort(
        (a, b) =>
            dailyMetricAttributionInstant(b).getTime() - dailyMetricAttributionInstant(a).getTime(),
    )
    const value = !ordered.length
        ? null
        : goal.aggregation === 'latest'
          ? ordered[0].canonicalValue
          : goal.aggregation === 'total'
            ? ordered.reduce((sum, item) => sum + item.canonicalValue, 0)
            : ordered.reduce((sum, item) => sum + item.canonicalValue, 0) / ordered.length
    let met: boolean | null = null
    let difference: number | null = null
    let progress: number | null = null
    if (value !== null) {
        if (goal.comparator === 'between' && 'min' in goal.target) {
            met = value >= goal.target.min && value <= goal.target.max
            difference =
                value < goal.target.min
                    ? goal.target.min - value
                    : value > goal.target.max
                      ? value - goal.target.max
                      : 0
        } else if ('value' in goal.target) {
            met =
                goal.comparator === 'gte' ? value >= goal.target.value : value <= goal.target.value
            difference = Math.abs(value - goal.target.value)
            progress =
                goal.comparator === 'gte' && goal.target.value > 0
                    ? Math.min(1, value / goal.target.value)
                    : null
        }
    }
    return {
        value,
        met,
        progress,
        observationCount: ordered.length,
        periodStart: bounds.start.toISOString(),
        periodEnd: bounds.end.toISOString(),
        difference,
    }
}
