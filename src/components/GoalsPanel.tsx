import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Chip,
    Group,
    Menu,
    Modal,
    NumberInput,
    Popover,
    Progress,
    Select,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconChevronDown, IconDots, IconTargetArrow, IconTrash } from '@tabler/icons-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { evaluateGoal, validateGoal, type Goal, type GoalPeriod } from '../domain/goals'
import {
    metricCatalog,
    metricDefinition,
    type GoalAggregation,
    type MetricComparison,
} from '../domain/metricCatalog'
import {
    convertMetricValue,
    displayUnitFor,
    formatMetric,
    toCanonicalMetricValue,
    unitPresentation,
} from '../domain/metrics'
import { useServerData } from '../hooks/useServerData'
import { createGoal, deleteGoal, retireGoal, updateGoal, type GoalRecord } from '../lib/goalApi'
import { listObservations } from '../lib/observationApi'
import { listMeals } from '../lib/nutritionApi'
import { effectiveMetricSeries, mealMetricObservations } from '../domain/effectiveMetrics'
import type { Observation } from '../domain/health'

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
                            ? `Latest value ${period === 'day' ? 'today' : 'this week'}`
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
          ? `Latest value ${goal.period.type === 'day' ? 'today' : 'this week'}`
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

function TimingDateControl({
    kind,
    mode,
    value,
    min,
    locale,
    onModeChange,
    onValueChange,
}: {
    kind: 'start' | 'end'
    mode: 'default' | 'date'
    value: string
    min?: string
    locale?: string
    onModeChange: (mode: 'default' | 'date') => void
    onValueChange: (value: string) => void
}) {
    const [opened, setOpened] = useState(false)
    const fallback = kind === 'start' ? 'Starts today' : 'No end date'
    const label =
        mode === 'date' && value
            ? new Date(`${value}T12:00:00`).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
              })
            : fallback
    return (
        <Popover opened={opened} onChange={setOpened} position="bottom-start" width="target">
            <Popover.Target>
                <Button
                    type="button"
                    variant="default"
                    className="goal-date-button"
                    fullWidth
                    justify="space-between"
                    rightSection={<IconChevronDown size={15} />}
                    aria-label={`Goal ${kind}`}
                    aria-expanded={opened}
                    onClick={() => setOpened(current => !current)}
                >
                    {label}
                </Button>
            </Popover.Target>
            <Popover.Dropdown>
                <Stack gap="xs">
                    <TextInput
                        type="date"
                        aria-label={kind === 'start' ? 'Start date' : 'End date'}
                        value={value}
                        min={min}
                        onChange={event => {
                            onValueChange(event.currentTarget.value)
                            onModeChange('date')
                            setOpened(false)
                        }}
                    />
                    <Button
                        type="button"
                        size="compact-sm"
                        variant="subtle"
                        onClick={() => {
                            onModeChange('default')
                            setOpened(false)
                        }}
                    >
                        {fallback}
                    </Button>
                </Stack>
            </Popover.Dropdown>
        </Popover>
    )
}

function GoalCard({
    goal,
    observations,
    timezone,
    locale,
    metricPreferences,
    onEdit,
    onRetire,
    onDelete,
}: {
    goal: GoalRecord
    observations: Observation[]
    timezone: string
    locale?: string
    metricPreferences?: Parameters<typeof formatMetric>[2]
    onEdit: () => void
    onRetire: () => Promise<void>
    onDelete: () => void
}) {
    const definition = metricDefinition(goal.metricId)
    const now = new Date()
    const evaluation = evaluateGoal(goal, observations, now, timezone)
    const upcoming = new Date(goal.effectiveFrom) > now
    const retired = Boolean(goal.effectiveTo && new Date(goal.effectiveTo) < now)
    const targetLabel =
        goal.comparator === 'between' && 'min' in goal.target
            ? `${formatMetric(goal.metricId, goal.target.min, metricPreferences, locale)}–${formatMetric(goal.metricId, goal.target.max, metricPreferences, locale)}`
            : 'value' in goal.target
              ? `${goal.comparator === 'gte' ? '≥' : '≤'} ${formatMetric(goal.metricId, goal.target.value, metricPreferences, locale)}`
              : ''
    const differenceLabel =
        evaluation.value !== null &&
        evaluation.met === false &&
        evaluation.difference !== null &&
        goal.comparator !== 'between'
            ? `${formatMetric(goal.metricId, evaluation.difference, metricPreferences, locale)} ${goal.comparator === 'lte' ? 'above' : 'below'} target`
            : null
    const scheduledDays = (
        goal.schedule.weekdays?.length ? goal.schedule.weekdays.map(String) : everyDay
    ).sort()
    const scheduleLabel = sameDays(scheduledDays, everyDay)
        ? null
        : sameDays(scheduledDays, weekdaySchedule)
          ? 'Weekdays'
          : sameDays(scheduledDays, weekendSchedule)
            ? 'Weekends'
            : scheduledDays
                  .map(day => weekdays.find(option => option.value === day)?.label.slice(0, 3))
                  .filter(Boolean)
                  .join(', ')
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
                    <Text fw={700}>{definition?.name ?? goal.metricId}</Text>
                    <Text size="sm" c="dimmed">
                        {periodText(goal)}
                    </Text>
                </div>
                <Group gap="xs">
                    <Badge
                        color={
                            retired || upcoming
                                ? 'gray'
                                : evaluation.met === null
                                  ? 'gray'
                                  : evaluation.met
                                    ? 'teal'
                                    : 'orange'
                        }
                        variant="light"
                    >
                        {retired
                            ? 'Past'
                            : upcoming
                              ? 'Upcoming'
                              : evaluation.met === null
                                ? 'No data'
                                : evaluation.met
                                  ? 'On target'
                                  : 'Not on target'}
                    </Badge>
                    <Menu>
                        <Menu.Target>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label={`Actions for ${definition?.name ?? goal.metricId}`}
                            >
                                <IconDots size={17} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {!retired ? (
                                <>
                                    <Menu.Item onClick={onEdit}>Edit goal</Menu.Item>
                                    <Menu.Item color="orange" onClick={() => void onRetire()}>
                                        Retire goal today
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
                {evaluation.value === null
                    ? upcoming
                        ? 'Starts soon'
                        : 'Nothing recorded yet'
                    : formatMetric(goal.metricId, evaluation.value, metricPreferences, locale)}
            </Text>
            <Text size="sm">Goal {targetLabel}</Text>
            {timingLabel && (
                <Text size="xs" c="dimmed">
                    {timingLabel}
                </Text>
            )}
            {upcoming ? (
                <Text size="sm" c="dimmed">
                    This goal starts on{' '}
                    {new Date(goal.effectiveFrom).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: timezone,
                    })}
                    .
                </Text>
            ) : evaluation.value === null ? (
                <Text size="sm" c="dimmed">
                    Record {definition?.name.toLowerCase() ?? 'this metric'} to see how this goal is
                    tracking.
                </Text>
            ) : (
                <Text size="sm" c="dimmed">
                    {evaluation.observationCount} measurement
                    {evaluation.observationCount === 1 ? '' : 's'}
                    {differenceLabel ? ` · ${differenceLabel}` : ''}
                </Text>
            )}
            {evaluation.progress !== null && (
                <Progress
                    value={evaluation.progress * 100}
                    color="trackit"
                    aria-label="Goal progress"
                />
            )}
        </article>
    )
}

export function GoalsPanel() {
    const { goals, preferences, loading } = useServerData()
    const goalMetrics = metricCatalog.filter(item => item.goalCapabilities)
    const [metricId, setMetricId] = useState('weight')
    const [measurement, setMeasurement] = useState(() => preferredMeasurement('weight')!.value)
    const [comparator, setComparator] = useState<MetricComparison>('lte')
    const [target, setTarget] = useState<number | string>(80)
    const [rangeMax, setRangeMax] = useState<number | string>(82)
    const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
    const [effectiveTo, setEffectiveTo] = useState('')
    const [startMode, setStartMode] = useState<'today' | 'date'>('today')
    const [endMode, setEndMode] = useState<'none' | 'date'>('none')
    const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('every-day')
    const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>(everyDay)
    const [editing, setEditing] = useState<GoalRecord | null>(null)
    const [deleting, setDeleting] = useState<GoalRecord | null>(null)
    const [observations, setObservations] = useState<Observation[]>([])
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const definition = metricDefinition(metricId)!
    const displayUnit = displayUnitFor(metricId, preferences?.metricPreferences, preferences?.units)
    const options = measurements(metricId)
    const selectedMeasurement =
        options.find(item => item.value === measurement) ?? preferredMeasurement(metricId, options)!
    useEffect(() => {
        const from = new Date()
        from.setDate(from.getDate() - 31)
        void Promise.all([
            listObservations({ from: from.toISOString() }),
            listMeals({ from: from.toISOString() }).catch(() => []),
        ])
            .then(([records, meals]) =>
                setObservations(
                    effectiveMetricSeries(
                        [...records, ...mealMetricObservations(meals)],
                        preferences?.metricPreferences,
                    ),
                ),
            )
            .catch(() => setError('Goal observations could not be loaded.'))
    }, [preferences?.metricPreferences])
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
        setError('')
    }
    const resetForm = () => {
        const today = new Date().toISOString().slice(0, 10)
        setEditing(null)
        setMetricId('weight')
        setMeasurement(preferredMeasurement('weight')!.value)
        setComparator('lte')
        setTarget(80)
        setRangeMax(82)
        setEffectiveFrom(today)
        setEffectiveTo('')
        setStartMode('today')
        setEndMode('none')
        setScheduleMode('every-day')
        setSelectedWeekdays(everyDay)
        setError('')
    }
    const edit = (goal: GoalRecord) => {
        setEditing(goal)
        setMetricId(goal.metricId)
        setMeasurement(
            `${goal.aggregation}:${goal.period.type}${goal.period.type === 'rolling' ? `:${goal.period.days}` : ''}`,
        )
        setComparator(goal.comparator)
        setEffectiveFrom(goal.effectiveFrom.slice(0, 10))
        setEffectiveTo(goal.effectiveTo?.slice(0, 10) ?? '')
        const goalDays = goal.schedule.weekdays?.length
            ? goal.schedule.weekdays.map(String)
            : everyDay
        setStartMode(
            goal.effectiveFrom.slice(0, 10) === new Date().toISOString().slice(0, 10)
                ? 'today'
                : 'date',
        )
        setEndMode(goal.effectiveTo ? 'date' : 'none')
        setScheduleMode(scheduleModeFor(goal.schedule.weekdays))
        setSelectedWeekdays(goalDays)
        const unit = displayUnitFor(
            goal.metricId,
            preferences?.metricPreferences,
            preferences?.units,
        )
        if ('value' in goal.target)
            setTarget(
                convertMetricValue(goal.metricId, goal.target.value, goal.canonicalUnit, unit),
            )
        else {
            setTarget(convertMetricValue(goal.metricId, goal.target.min, goal.canonicalUnit, unit))
            setRangeMax(
                convertMetricValue(goal.metricId, goal.target.max, goal.canonicalUnit, unit),
            )
        }
    }
    const draft = (): Omit<Goal, 'id'> => ({
        metricId,
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
        effectiveFrom: new Date(
            `${startMode === 'today' ? new Date().toISOString().slice(0, 10) : effectiveFrom}T00:00:00`,
        ).toISOString(),
        effectiveTo:
            endMode === 'date' && effectiveTo
                ? new Date(`${effectiveTo}T23:59:59`).toISOString()
                : null,
        schedule: { weekdays: selectedWeekdays.map(Number) },
    })
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
    const save = async (event: FormEvent) => {
        event.preventDefault()
        const errors = validation()
        if (errors.length) {
            setError(errors[0])
            return
        }
        setSaving(true)
        setError('')
        try {
            const input = draft()
            if (editing) await updateGoal(editing.id, input)
            else await createGoal(input)
            setMessage(editing ? 'Goal updated.' : 'Goal added.')
            resetForm()
        } catch {
            setError('The goal could not be saved. Check the values and try again.')
        } finally {
            setSaving(false)
        }
    }
    const activeGoals = useMemo(
        () => goals.filter(goal => !goal.effectiveTo || new Date(goal.effectiveTo) > new Date()),
        [goals],
    )
    const pastGoals = goals.filter(goal => !activeGoals.includes(goal))
    const retire = async (goal: GoalRecord) => {
        try {
            await retireGoal(goal)
            setMessage('Goal retired.')
        } catch {
            setError('The goal could not be retired.')
        }
    }
    const remove = async () => {
        if (!deleting) return
        setSaving(true)
        setError('')
        try {
            await deleteGoal(deleting)
            setDeleting(null)
            setMessage('Retired goal deleted.')
        } catch {
            setError('The retired goal could not be deleted.')
        } finally {
            setSaving(false)
        }
    }
    return (
        <div className="goals-layout">
            <section className="panel goal-create" aria-labelledby="create-goal-title">
                <div className="goal-section-heading">
                    <IconTargetArrow size={24} />
                    <div>
                        <h2 id="create-goal-title">{editing ? 'Edit goal' : 'Add a goal'}</h2>
                        <Text size="sm" c="dimmed">
                            Choose what to measure, then set a clear target.
                        </Text>
                    </div>
                </div>
                <form onSubmit={event => void save(event)}>
                    <Stack>
                        <Select
                            label="Metric"
                            value={metricId}
                            onChange={value => value && resetForMetric(value)}
                            data={goalMetrics.map(item => ({ value: item.id, label: item.name }))}
                            searchable
                        />
                        <Select
                            label="Measure"
                            value={measurement}
                            onChange={value => value && setMeasurement(value)}
                            data={options.map(item => ({
                                value: item.value,
                                label: item.label.replace(/^./, letter => letter.toUpperCase()),
                            }))}
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
                        <section className="goal-timing" aria-labelledby="goal-timing-heading">
                            <Group justify="space-between" gap="xs">
                                <Text id="goal-timing-heading" fw={650} size="sm">
                                    Timing
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Optional
                                </Text>
                            </Group>
                            <Text size="xs" fw={600} c="dimmed">
                                Active period
                            </Text>
                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                                <TimingDateControl
                                    kind="start"
                                    mode={startMode === 'today' ? 'default' : 'date'}
                                    value={effectiveFrom}
                                    locale={preferences?.locale}
                                    onModeChange={mode => {
                                        setStartMode(mode === 'default' ? 'today' : 'date')
                                        if (mode === 'default')
                                            setEffectiveFrom(new Date().toISOString().slice(0, 10))
                                    }}
                                    onValueChange={setEffectiveFrom}
                                />
                                <TimingDateControl
                                    kind="end"
                                    mode={endMode === 'none' ? 'default' : 'date'}
                                    value={effectiveTo || effectiveFrom}
                                    min={effectiveFrom}
                                    locale={preferences?.locale}
                                    onModeChange={mode =>
                                        setEndMode(mode === 'default' ? 'none' : 'date')
                                    }
                                    onValueChange={setEffectiveTo}
                                />
                            </SimpleGrid>
                            <Text size="xs" fw={600} c="dimmed">
                                Schedule
                            </Text>
                            <Select
                                aria-label="Goal schedule"
                                value={scheduleMode}
                                onChange={changeSchedule}
                                data={[
                                    { value: 'every-day', label: 'Every day' },
                                    { value: 'weekdays', label: 'Weekdays' },
                                    { value: 'weekends', label: 'Weekends' },
                                    { value: 'custom', label: 'Custom' },
                                ]}
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
                        </section>
                        {error && <Alert color="orange">{error}</Alert>}
                        <Group justify="flex-end">
                            {editing && (
                                <Button type="button" variant="default" onClick={resetForm}>
                                    Cancel
                                </Button>
                            )}
                            <Button type="submit" loading={saving}>
                                {editing ? 'Save changes' : 'Create goal'}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </section>
            <section className="panel goal-list" aria-labelledby="your-goals-title">
                <Group justify="space-between">
                    <div>
                        <h2 id="your-goals-title">Your goals</h2>
                        <Text size="sm" c="dimmed">
                            Current status is calculated from your recorded observations.
                        </Text>
                    </div>
                </Group>
                {message && (
                    <Alert color="teal" role="status">
                        {message}
                    </Alert>
                )}
                {loading ? (
                    <Stack role="status" aria-label="Loading goals">
                        <Skeleton height={150} />
                    </Stack>
                ) : goals.length === 0 ? (
                    <div className="goal-empty">
                        <IconTargetArrow size={28} />
                        <Text fw={700}>No goals yet</Text>
                        <Text size="sm" c="dimmed">
                            Create a goal to see its current status.
                        </Text>
                    </div>
                ) : (
                    <Stack gap="sm">
                        {activeGoals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                observations={observations}
                                timezone={preferences?.timezone ?? 'UTC'}
                                locale={preferences?.locale}
                                metricPreferences={preferences?.metricPreferences}
                                onEdit={() => edit(goal)}
                                onRetire={() => retire(goal)}
                                onDelete={() => setDeleting(goal)}
                            />
                        ))}
                        {pastGoals.length > 0 && <Text fw={700}>Goal history</Text>}
                        {pastGoals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                observations={observations}
                                timezone={preferences?.timezone ?? 'UTC'}
                                locale={preferences?.locale}
                                metricPreferences={preferences?.metricPreferences}
                                onEdit={() => edit(goal)}
                                onRetire={() => retire(goal)}
                                onDelete={() => setDeleting(goal)}
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
                    This permanently removes the {metricDefinition(deleting?.metricId ?? '')?.name}
                    goal. Your health records are not affected.
                </Text>
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={() => setDeleting(null)}>
                        Keep goal
                    </Button>
                    <Button color="red" loading={saving} onClick={() => void remove()}>
                        Delete goal
                    </Button>
                </Group>
            </Modal>
        </div>
    )
}
