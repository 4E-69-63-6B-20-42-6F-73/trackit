import type { Goal, GoalEvaluation } from '@trackit/domain/goals'
import { metricDefinition } from '@trackit/domain/metricCatalog'
import { formatMetric } from '@trackit/domain/metrics'
import type { GoalRecord } from '../lib/goalApi'

const everyDay = ['0', '1', '2', '3', '4', '5', '6']
const weekdaySchedule = ['1', '2', '3', '4', '5']
const weekendSchedule = ['0', '6']
const weekdays = [
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
    { value: '0', label: 'Sunday' },
]

type ScheduleMode = 'every-day' | 'weekdays' | 'weekends' | 'custom'

const sameDays = (left: string[], right: string[]) =>
    left.length === right.length && left.every(day => right.includes(day))

const scheduleModeFor = (days: number[] | undefined): ScheduleMode => {
    const values = (days?.length ? days.map(String) : everyDay).sort()
    if (sameDays(values, everyDay)) return 'every-day'
    if (sameDays(values, weekdaySchedule)) return 'weekdays'
    if (sameDays(values, weekendSchedule)) return 'weekends'
    return 'custom'
}

const periodText = (goal: Goal) =>
    goal.period.type === 'rolling'
        ? `${goal.period.days}-day ${goal.aggregation}`
        : goal.aggregation === 'latest'
          ? `${goal.period.type === 'day' ? 'Daily' : 'Weekly'} latest value`
          : `${goal.period.type === 'day' ? 'Daily' : 'Weekly'} ${goal.aggregation}`

const defaultEvaluation: GoalEvaluation = {
    value: null,
    met: null,
    progress: null,
    observationCount: 0,
    periodStart: '',
    periodEnd: '',
    difference: null,
}

export type GoalCardPresentation = {
    definitionName: string
    periodLabel: string
    statusLabel: string
    statusColor: 'gray' | 'teal' | 'orange'
    valueLabel: string
    targetLabel: string
    timingLabel: string
    detailLabel: string
    progress: number | null
    retired: boolean
}

export function goalCardPresentation({
    goal,
    evaluation,
    evaluationUnavailable,
    timezone,
    locale,
    metricPreferences,
    now = new Date(),
}: {
    goal: GoalRecord
    evaluation?: GoalEvaluation
    evaluationUnavailable?: boolean
    timezone: string
    locale?: string
    metricPreferences?: Parameters<typeof formatMetric>[2]
    now?: Date
}): GoalCardPresentation {
    const definition = metricDefinition(goal.definitionId)
    const definitionName = definition?.name ?? goal.definitionId
    const result = evaluation ?? defaultEvaluation
    const upcoming = new Date(goal.effectiveFrom) > now
    const retired = Boolean(goal.effectiveTo && new Date(goal.effectiveTo) < now)
    const targetLabel =
        goal.comparator === 'between' && 'min' in goal.target
            ? `${formatMetric(goal.definitionId, goal.target.min, metricPreferences, locale)}–${formatMetric(goal.definitionId, goal.target.max, metricPreferences, locale)}`
            : 'value' in goal.target
              ? `${goal.comparator === 'gte' ? 'at least' : 'at or below'} ${formatMetric(goal.definitionId, goal.target.value, metricPreferences, locale)}`
              : ''
    const differenceLabel =
        result.value !== null &&
        result.met === false &&
        result.difference !== null &&
        goal.comparator !== 'between'
            ? `${formatMetric(goal.definitionId, result.difference, metricPreferences, locale)} ${goal.comparator === 'lte' ? 'above' : 'below'} target`
            : null
    const scheduledDays = (
        goal.schedule.weekdays?.length ? goal.schedule.weekdays.map(String) : everyDay
    ).sort()
    const mode = scheduleModeFor(goal.schedule.weekdays)
    const scheduleLabel =
        mode === 'custom'
            ? scheduledDays
                  .map(day => weekdays.find(option => option.value === day)?.label.slice(0, 3))
                  .filter(Boolean)
                  .join(', ')
            : mode === 'every-day'
              ? null
              : mode === 'weekdays'
                ? 'Weekdays'
                : 'Weekends'
    const timingLabel = [
        scheduleLabel,
        goal.effectiveTo
            ? `Until ${new Date(goal.effectiveTo).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: timezone,
              })}`
            : null,
    ]
        .filter(Boolean)
        .join(' · ')

    const statusLabel = retired
        ? 'Past'
        : upcoming
          ? 'Upcoming'
          : evaluationUnavailable
            ? 'Unavailable'
            : result.met === null
              ? 'No data'
              : result.met
                ? 'On target'
                : 'Not on target'
    const statusColor =
        retired || upcoming || evaluationUnavailable || result.met === null
            ? 'gray'
            : result.met
              ? 'teal'
              : 'orange'
    const valueLabel = evaluationUnavailable
        ? 'Progress unavailable'
        : result.value === null
          ? upcoming
              ? 'Starts soon'
              : 'Nothing recorded yet'
          : formatMetric(goal.definitionId, result.value, metricPreferences, locale)
    const detailLabel = evaluationUnavailable
        ? 'Goal progress could not be loaded.'
        : upcoming
          ? `Starts ${new Date(goal.effectiveFrom).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                timeZone: timezone,
            })}.`
          : result.value === null
            ? `Record ${definition?.name.toLowerCase() ?? 'this metric'} to see progress.`
            : `${result.observationCount} measurement${result.observationCount === 1 ? '' : 's'}${differenceLabel ? ` · ${differenceLabel}` : ''}`

    return {
        definitionName,
        periodLabel: periodText(goal),
        statusLabel,
        statusColor,
        valueLabel,
        targetLabel,
        timingLabel,
        detailLabel,
        progress: evaluationUnavailable ? null : result.progress,
        retired,
    }
}
