import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Chip,
    Collapse,
    Group,
    Menu,
    Modal,
    NumberInput,
    Progress,
    Select,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
    IconChevronDown,
    IconChevronUp,
    IconDots,
    IconTargetArrow,
    IconTrash,
} from '@tabler/icons-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    calendarDayRangeForKey,
    calendarTodayKey,
    formatCalendarDate,
} from '@trackit/domain/calendar'
import {
    validateGoal,
    type Goal,
    type GoalEvaluation,
    type GoalPeriod,
} from '@trackit/domain/goals'
import {
    metricCatalog,
    metricDefinition,
    type GoalAggregation,
    type MetricComparison,
} from '@trackit/domain/metricCatalog'
import {
    convertMetricValue,
    displayUnitFor,
    formatMetric,
    toCanonicalMetricValue,
    unitPresentation,
} from '@trackit/domain/metrics'
import { useServerData } from '../hooks/useServerData'
import {
    createGoal,
    deleteGoal,
    listGoalEvaluations,
    retireGoal,
    updateGoal,
    type GoalRecord,
} from '../lib/goalApi'
import { healthQueryKeys } from '../lib/healthQueries'

const weekdays = [
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
    { value: '0', label: 'Sunday' },
]
const everyDay = ['0', '1', '2', '3', '4', '5', '6']
const weekdaySchedule = ['1', '2', '3', '4', '5']
const weekendSchedule = ['0', '6']
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
const scheduleLabels: Record<ScheduleMode, string> = {
    'every-day': 'Every day',
    weekdays: 'Weekdays',
    weekends: 'Weekends',
    custom: 'Custom days',
}
const comparatorLabels: Record<MetricComparison, string> = {
    gte: 'At least',
    lte: 'At or below',
    between: 'Between',
}
type Measurement = {
    value: string
    label: string
    aggregation: GoalAggregation
    period: GoalPeriod
}

function measurements(metricId: string): Measurement[] {
    const capabilities = metricDefinition(metricId)?.goalCapabilities
    if (!capabilities) return []
    const result: Measurement[] = []
    for (const [aggregation, periods] of Object.entries(capabilities.aggregations) as [
        GoalAggregation,
        readonly ('day' | 'week' | 'rolling')[],
    ][])
        for (const period of periods) {
            if (period === 'rolling')
                for (const days of [7, 14, 30] as const)
                    result.push({
                        value: `${aggregation}:rolling:${days}`,
                        label: `${days}-day ${aggregation}`,
                        aggregation,
                        period: { type: 'rolling', days },
                    })
            else
                result.push({
                    value: `${aggregation}:${period}`,
                    label:
                        aggregation === 'latest'
                            ? `Latest value ${period === 'day' ? 'each day' : 'each week'}`
                            : `${period === 'day' ? 'Daily' : 'Weekly'} ${aggregation}`,
                    aggregation,
                    period: { type: period },
                })
        }
    return result
}
const preferredMeasurement = (metricId: string, options = measurements(metricId)) => {
    const defaults = metricDefinition(metricId)?.goalDefaults
    const preferredValue = defaults
        ? `${defaults.aggregation}:${defaults.period}${defaults.period === 'rolling' ? `:${defaults.rollingDays ?? 7}` : ''}`
        : null
    return options.find(item => item.value === preferredValue) ?? options[0]
}
const periodText = (goal: Goal) =>
    goal.period.type === 'rolling'
        ? `${goal.period.days}-day ${goal.aggregation}`
        : goal.aggregation === 'latest'
          ? `${goal.period.type === 'day' ? 'Daily' : 'Weekly'} latest value`
          : `${goal.period.type === 'day' ? 'Daily' : 'Weekly'} ${goal.aggregation}`

function TargetValueInput({
    label,
    value,
    unit,
    onChange,
    required,
}: {
    label: string
    value: number | string
    unit: string
    onChange: (value: number | string) => void
    required?: boolean
}) {
    return (
        <div className="goal-target-input">
            <NumberInput
                label={label}
                value={value}
                onChange={onChange}
                required={required}
                hideControls
            />
            <Text className="goal-target-unit" aria-hidden="true">
                {unitPresentation(unit).label}
            </Text>
        </div>
    )
}

function GoalCard({
    goal,
    evaluation,
    evaluationUnavailable,
    retiring,
    timezone,
    locale,
    metricPreferences,
    onEdit,
    onRetire,
    onDelete,
    onViewTrend,
}: {
    goal: GoalRecord
    evaluation?: GoalEvaluation
    evaluationUnavailable?: boolean
    retiring?: boolean
    timezone: string
    locale?: string
    metricPreferences?: Parameters<typeof formatMetric>[2]
    onEdit: () => void
    onRetire: () => Promise<void>
    onDelete: () => void
    onViewTrend: () => void
}) {
    const definition = metricDefinition(goal.definitionId)
    const now = new Date()
    const result = evaluation ?? {
        value: null,
        met: null,
        progress: null,
        observationCount: 0,
        difference: null,
    }
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
              : scheduleLabels[mode]
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

    return (
        <article className="goal-card">
            <Group justify="space-between" align="start" wrap="nowrap">
                <div>
                    <Text fw={700}>{definition?.name ?? goal.definitionId}</Text>
                    <Text size="sm" c="dimmed">
                        {periodText(goal)}
                    </Text>
                </div>
                <Group gap="xs">
                    <Badge
                        color={
                            retired || upcoming || evaluationUnavailable
                                ? 'gray'
                                : result.met === null
                                  ? 'gray'
                                  : result.met
                                    ? 'teal'
                                    : 'orange'
                        }
                        variant="light"
                    >
                        {retired
                            ? 'Past'
                            : upcoming
                              ? 'Upcoming'
                              : evaluationUnavailable
                                ? 'Unavailable'
                                : result.met === null
                                  ? 'No data'
                                  : result.met
                                    ? 'On target'
                                    : 'Not on target'}
                    </Badge>
                    <Menu>
                        <Menu.Target>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label={`Actions for ${definition?.name ?? goal.definitionId}`}
                            >
                                <IconDots size={17} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item onClick={onViewTrend}>View trend</Menu.Item>
                            {!retired ? (
                                <>
                                    <Menu.Item onClick={onEdit}>Edit goal</Menu.Item>
                                    <Menu.Item
                                        color="orange"
                                        disabled={retiring}
                                        onClick={() => void onRetire()}
                                    >
                                        {retiring ? 'Retiring goal…' : 'Retire goal today'}
                                    </Menu.Item>
                                </>
                            ) : (
                                <Menu.Item
                                    color="red"
                                    leftSection={<IconTrash size={15} />}
                                    onClick={onDelete}
                                >
                                    Delete goal
                                </Menu.Item>
                            )}
                        </Menu.Dropdown>
                    </Menu>
                </Group>
            </Group>
            <Text className="goal-target">
                {evaluationUnavailable
                    ? 'Progress unavailable'
                    : result.value === null
                      ? upcoming
                          ? 'Starts soon'
                          : 'Nothing recorded yet'
                      : formatMetric(goal.definitionId, result.value, metricPreferences, locale)}
            </Text>
            <Text size="sm">Target: {targetLabel}</Text>
            {timingLabel && (
                <Text size="xs" c="dimmed">
                    {timingLabel}
                </Text>
            )}
            {evaluationUnavailable ? (
                <Text size="sm" c="dimmed">
                    Goal progress could not be loaded.
                </Text>
            ) : upcoming ? (
                <Text size="sm" c="dimmed">
                    Starts{' '}
                    {new Date(goal.effectiveFrom).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: timezone,
                    })}
                    .
                </Text>
            ) : result.value === null ? (
                <Text size="sm" c="dimmed">
                    Record {definition?.name.toLowerCase() ?? 'this metric'} to see progress.
                </Text>
            ) : (
                <Text size="sm" c="dimmed">
                    {result.observationCount} measurement{result.observationCount === 1 ? '' : 's'}
                    {differenceLabel ? ` · ${differenceLabel}` : ''}
                </Text>
            )}
            {!evaluationUnavailable && result.progress !== null && (
                <Progress
                    value={result.progress * 100}
                    color="trackit"
                    aria-label="Goal progress"
                />
            )}
        </article>
    )
}

export function GoalsPanel() {
    const navigate = useNavigate()
    const {
        goals,
        preferences,
        loading: serverLoading,
        unavailable: serverUnavailable,
    } = useServerData()
    const timezone = preferences?.timezone ?? 'UTC'
    const today = calendarTodayKey(timezone)
    const goalMetrics = metricCatalog.filter(item => item.goalCapabilities)
    const [metricId, setMetricId] = useState('weight')
    const [measurement, setMeasurement] = useState(() => preferredMeasurement('weight')!.value)
    const [comparator, setComparator] = useState<MetricComparison>('lte')
    const [target, setTarget] = useState<number | string>(80)
    const [rangeMax, setRangeMax] = useState<number | string>(82)
    const [effectiveFrom, setEffectiveFrom] = useState(today)
    const [effectiveTo, setEffectiveTo] = useState('')
    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('every-day')
    const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(everyDay)
    const [advanced, setAdvanced] = useState(false)
    const [editing, setEditing] = useState<GoalRecord | null>(null)
    const [deleting, setDeleting] = useState<GoalRecord | null>(null)
    const [validationError, setValidationError] = useState('')
    const evaluationsQuery = useQuery({
        queryKey: [...healthQueryKeys.goalEvaluations, 'goals-page'],
        enabled: goals.length > 0,
        queryFn: ({ signal }) => listGoalEvaluations(signal),
    })
    const evaluations = evaluationsQuery.data ?? {}
    const loading = serverLoading || (goals.length > 0 && evaluationsQuery.isPending)
    const evaluationError = evaluationsQuery.isError ? 'Goal observations could not be loaded.' : ''
    const definition = metricDefinition(metricId)!
    const displayUnit = displayUnitFor(metricId, preferences?.metricPreferences)
    const options = measurements(metricId)
    const selectedMeasurement =
        options.find(item => item.value === measurement) ?? preferredMeasurement(metricId, options)!

    const resetForMetric = (next: string) => {
        setMetricId(next)
        const choice = preferredMeasurement(next)
        if (choice) setMeasurement(choice.value)
        const nextDefinition = metricDefinition(next)
        const defaults = nextDefinition?.goalDefaults
        const nextComparator =
            defaults && nextDefinition.goalCapabilities?.comparators.includes(defaults.comparator)
                ? defaults.comparator
                : (nextDefinition?.goalCapabilities?.comparators[0] ?? 'gte')
        const nextTarget = defaults?.target ?? 1
        setComparator(nextComparator)
        setTarget(nextTarget)
        setRangeMax(nextTarget + Math.max(1, Math.abs(nextTarget) * 0.05))
        setValidationError('')
    }
    const resetForm = () => {
        setEditing(null)
        setMetricId('weight')
        setMeasurement(preferredMeasurement('weight')!.value)
        setComparator('lte')
        setTarget(80)
        setRangeMax(82)
        setEffectiveFrom(today)
        setEffectiveTo('')
        setScheduleMode('every-day')
        setSelectedWeekdays(everyDay)
        setAdvanced(false)
        setValidationError('')
    }
    const edit = (goal: GoalRecord) => {
        setEditing(goal)
        setMetricId(goal.definitionId)
        setMeasurement(
            `${goal.aggregation}:${goal.period.type}${goal.period.type === 'rolling' ? `:${goal.period.days}` : ''}`,
        )
        setComparator(goal.comparator)
        setEffectiveFrom(goal.effectiveFrom.slice(0, 10))
        setEffectiveTo(goal.effectiveTo?.slice(0, 10) ?? '')
        const goalDays = goal.schedule.weekdays?.length
            ? goal.schedule.weekdays.map(String)
            : everyDay
        setScheduleMode(scheduleModeFor(goal.schedule.weekdays))
        setSelectedWeekdays(goalDays)
        setAdvanced(true)
        const unit = displayUnitFor(goal.definitionId, preferences?.metricPreferences)
        if ('value' in goal.target)
            setTarget(
                convertMetricValue(goal.definitionId, goal.target.value, goal.canonicalUnit, unit),
            )
        else {
            setTarget(
                convertMetricValue(goal.definitionId, goal.target.min, goal.canonicalUnit, unit),
            )
            setRangeMax(
                convertMetricValue(goal.definitionId, goal.target.max, goal.canonicalUnit, unit),
            )
        }
    }
    const draft = (): Omit<Goal, 'id'> => {
        const startRange = calendarDayRangeForKey(effectiveFrom || today, timezone)
        const endRange = effectiveTo ? calendarDayRangeForKey(effectiveTo, timezone) : null
        return {
            definitionId: metricId,
            aggregation: selectedMeasurement.aggregation,
            comparator,
            target:
                comparator === 'between'
                    ? {
                          min: toCanonicalMetricValue(metricId, Number(target), displayUnit),
                          max: toCanonicalMetricValue(metricId, Number(rangeMax), displayUnit),
                      }
                    : { value: toCanonicalMetricValue(metricId, Number(target), displayUnit) },
            period: selectedMeasurement.period,
            canonicalUnit: definition.canonicalUnit,
            effectiveFrom: startRange.from.toISOString(),
            effectiveTo: endRange ? new Date(endRange.to.getTime() - 1).toISOString() : null,
            schedule: { weekdays: selectedWeekdays.map(Number) },
        }
    }
    const validation = () => {
        if (scheduleMode === 'custom' && selectedWeekdays.length === 0)
            return ['Choose at least one day for a custom schedule.']
        try {
            return validateGoal(draft())
        } catch {
            return ['Target could not be converted.']
        }
    }
    const changeSchedule = (value: string | null) => {
        if (!value) return
        const mode = value as ScheduleMode
        setScheduleMode(mode)
        if (mode === 'every-day') setSelectedWeekdays(everyDay)
        if (mode === 'weekdays') setSelectedWeekdays(weekdaySchedule)
        if (mode === 'weekends') setSelectedWeekdays(weekendSchedule)
        if (mode === 'custom' && selectedWeekdays.length === 0) setSelectedWeekdays(weekdaySchedule)
    }
    const saveMutation = useMutation({
        mutationFn: async ({
            goal,
            input,
        }: {
            goal: GoalRecord | null
            input: Omit<Goal, 'id'>
        }) => {
            if (goal) return updateGoal(goal.id, input)
            return createGoal(input)
        },
        onSuccess: () => resetForm(),
    })
    const retireMutation = useMutation({
        mutationFn: retireGoal,
    })
    const deleteMutation = useMutation({
        mutationFn: deleteGoal,
        onSuccess: () => setDeleting(null),
    })
    const latestMutation = [
        {
            result: saveMutation,
            error: 'The goal could not be saved. Check the values and try again.',
            success: saveMutation.variables?.goal ? 'Goal updated.' : 'Goal added.',
        },
        {
            result: retireMutation,
            error: 'The goal could not be retired.',
            success: 'Goal retired.',
        },
        {
            result: deleteMutation,
            error: 'The retired goal could not be deleted.',
            success: 'Retired goal deleted.',
        },
    ].reduce((latest, current) =>
        current.result.submittedAt > latest.result.submittedAt ? current : latest,
    )
    const mutationError = latestMutation.result.isError ? latestMutation.error : ''
    const mutationMessage = latestMutation.result.isSuccess ? latestMutation.success : ''
    const save = (event: FormEvent) => {
        event.preventDefault()
        const errors = validation()
        if (errors.length) {
            setValidationError(errors[0])
            return
        }
        setValidationError('')
        saveMutation.mutate({ goal: editing, input: draft() })
    }
    const activeGoals = useMemo(
        () => goals.filter(goal => !goal.effectiveTo || new Date(goal.effectiveTo) > new Date()),
        [goals],
    )
    const pastGoals = goals.filter(goal => !activeGoals.includes(goal))
    const retire = async (goal: GoalRecord) => {
        await retireMutation.mutateAsync(goal)
    }
    const remove = () => {
        if (deleting) deleteMutation.mutate(deleting)
    }
    const targetPreview =
        comparator === 'between'
            ? `between ${target} and ${rangeMax} ${unitPresentation(displayUnit).label}`
            : `${comparator === 'gte' ? 'at least' : 'at or below'} ${target} ${unitPresentation(displayUnit).label}`

    return (
        <div className={`goals-layout${goals.length ? ' has-goals' : ''}`}>
            <section className="panel goal-create" aria-labelledby="create-goal-title">
                <div className="goal-section-heading">
                    <IconTargetArrow size={24} />
                    <div>
                        <h2 id="create-goal-title">{editing ? 'Edit goal' : 'Add a goal'}</h2>
                        <Text size="sm" c="dimmed">
                            Choose what matters, set the target, then decide when it applies.
                        </Text>
                    </div>
                </div>
                <form onSubmit={save}>
                    <Stack>
                        <Select
                            label="What do you want to track?"
                            value={metricId}
                            onChange={value => value && resetForMetric(value)}
                            data={goalMetrics.map(item => ({ value: item.id, label: item.name }))}
                            searchable
                        />
                        <Select
                            label="Target"
                            value={comparator}
                            onChange={value => value && setComparator(value as MetricComparison)}
                            data={definition.goalCapabilities!.comparators.map(value => ({
                                value,
                                label: comparatorLabels[value],
                            }))}
                        />
                        {comparator === 'between' ? (
                            <div
                                className="goal-range-inputs"
                                role="group"
                                aria-label="Target range"
                            >
                                <TargetValueInput
                                    label="Minimum"
                                    value={target}
                                    onChange={setTarget}
                                    unit={displayUnit}
                                />
                                <Text className="goal-range-separator">and</Text>
                                <TargetValueInput
                                    label="Maximum"
                                    value={rangeMax}
                                    onChange={setRangeMax}
                                    unit={displayUnit}
                                />
                            </div>
                        ) : (
                            <TargetValueInput
                                label="Value"
                                value={target}
                                onChange={setTarget}
                                unit={displayUnit}
                                required
                            />
                        )}
                        <Select
                            label="How often?"
                            value={scheduleMode}
                            onChange={changeSchedule}
                            data={Object.entries(scheduleLabels).map(([value, label]) => ({
                                value,
                                label,
                            }))}
                        />
                        {scheduleMode === 'custom' && (
                            <Chip.Group
                                multiple
                                value={selectedWeekdays}
                                onChange={setSelectedWeekdays}
                            >
                                <div
                                    className="goal-weekday-grid"
                                    role="group"
                                    aria-label="Custom days"
                                >
                                    {weekdays.map(day => (
                                        <Chip
                                            key={day.value}
                                            value={day.value}
                                            size="sm"
                                            className="goal-weekday-chip"
                                            aria-label={day.label}
                                        >
                                            {day.label.slice(0, 1)}
                                        </Chip>
                                    ))}
                                </div>
                            </Chip.Group>
                        )}
                        <Text size="sm" c="dimmed">
                            {`Aim for ${definition.name.toLowerCase()} ${targetPreview} ${scheduleLabels[scheduleMode].toLowerCase()}.`}
                        </Text>

                        <Button
                            type="button"
                            variant="subtle"
                            color="gray"
                            justify="space-between"
                            rightSection={
                                advanced ? (
                                    <IconChevronUp size={15} />
                                ) : (
                                    <IconChevronDown size={15} />
                                )
                            }
                            onClick={() => setAdvanced(value => !value)}
                        >
                            Advanced options
                        </Button>
                        <Collapse expanded={advanced}>
                            <Stack gap="md">
                                <Select
                                    label="How should TrackIt measure progress?"
                                    value={measurement}
                                    onChange={value => value && setMeasurement(value)}
                                    data={options.map(item => ({
                                        value: item.value,
                                        label: item.label.replace(/^./, letter =>
                                            letter.toUpperCase(),
                                        ),
                                    }))}
                                />
                                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                    <TextInput
                                        type="date"
                                        label="Starts"
                                        value={effectiveFrom}
                                        onChange={event =>
                                            setEffectiveFrom(event.currentTarget.value)
                                        }
                                    />
                                    <TextInput
                                        type="date"
                                        label="Ends (optional)"
                                        min={effectiveFrom}
                                        value={effectiveTo}
                                        onChange={event =>
                                            setEffectiveTo(event.currentTarget.value)
                                        }
                                    />
                                </SimpleGrid>
                                {effectiveFrom && (
                                    <Text size="xs" c="dimmed">
                                        Starts{' '}
                                        {formatCalendarDate(effectiveFrom, preferences?.locale, {
                                            day: 'numeric',
                                            month: 'short',
                                            year: 'numeric',
                                        })}
                                        {effectiveTo
                                            ? ` and ends ${formatCalendarDate(effectiveTo, preferences?.locale, { day: 'numeric', month: 'short', year: 'numeric' })}.`
                                            : '.'}
                                    </Text>
                                )}
                            </Stack>
                        </Collapse>
                        {(validationError || mutationError) && (
                            <Alert color="orange">{validationError || mutationError}</Alert>
                        )}
                        <Group justify="flex-end">
                            {editing && (
                                <Button type="button" variant="default" onClick={resetForm}>
                                    Cancel
                                </Button>
                            )}
                            <Button type="submit" loading={saveMutation.isPending}>
                                {editing ? 'Save changes' : 'Create goal'}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </section>

            <section className="panel goal-list" aria-labelledby="your-goals-title">
                <h2 id="your-goals-title">Your goals</h2>
                <Text size="sm" c="dimmed" mb="md">
                    Current status is calculated from recorded observations.
                </Text>
                {mutationMessage && (
                    <Alert color="teal" role="status">
                        {mutationMessage}
                    </Alert>
                )}
                {evaluationError && <Alert color="orange">{evaluationError}</Alert>}
                {loading ? (
                    <Stack role="status" aria-label="Loading goals">
                        <Skeleton height={150} />
                    </Stack>
                ) : serverUnavailable ? (
                    <Alert color="orange">Goals could not be loaded from the server.</Alert>
                ) : goals.length === 0 ? (
                    <div className="goal-empty">
                        <IconTargetArrow size={28} />
                        <Text fw={700}>No goals yet</Text>
                        <Text size="sm" c="dimmed">
                            Create a goal when you want a target to add context to your
                            observations.
                        </Text>
                    </div>
                ) : (
                    <Stack gap="sm">
                        {activeGoals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                evaluation={evaluations[goal.id]}
                                evaluationUnavailable={evaluationsQuery.isError}
                                retiring={
                                    retireMutation.isPending &&
                                    retireMutation.variables?.id === goal.id
                                }
                                timezone={timezone}
                                locale={preferences?.locale}
                                metricPreferences={preferences?.metricPreferences}
                                onEdit={() => edit(goal)}
                                onRetire={() => retire(goal)}
                                onDelete={() => setDeleting(goal)}
                                onViewTrend={() =>
                                    navigate(
                                        `/trends?metric=${encodeURIComponent(goal.definitionId)}`,
                                    )
                                }
                            />
                        ))}
                        {pastGoals.length > 0 && <Text fw={700}>Goal history</Text>}
                        {pastGoals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                evaluation={evaluations[goal.id]}
                                evaluationUnavailable={evaluationsQuery.isError}
                                retiring={
                                    retireMutation.isPending &&
                                    retireMutation.variables?.id === goal.id
                                }
                                timezone={timezone}
                                locale={preferences?.locale}
                                metricPreferences={preferences?.metricPreferences}
                                onEdit={() => edit(goal)}
                                onRetire={() => retire(goal)}
                                onDelete={() => setDeleting(goal)}
                                onViewTrend={() =>
                                    navigate(
                                        `/trends?metric=${encodeURIComponent(goal.definitionId)}`,
                                    )
                                }
                            />
                        ))}
                    </Stack>
                )}
            </section>

            <Modal
                opened={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title="Delete this retired goal?"
                centered
                size="sm"
            >
                <Text size="sm">
                    This permanently removes the{' '}
                    {metricDefinition(deleting?.definitionId ?? '')?.name} goal. Your observations
                    are not affected.
                </Text>
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={() => setDeleting(null)}>
                        Keep goal
                    </Button>
                    <Button color="red" loading={deleteMutation.isPending} onClick={remove}>
                        Delete goal
                    </Button>
                </Group>
            </Modal>
        </div>
    )
}
