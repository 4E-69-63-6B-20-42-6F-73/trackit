import { useEffect, useState } from 'react'
import {
    ActionIcon,
    Badge,
    Button,
    Checkbox,
    Group,
    Modal,
    Progress,
    Skeleton,
    Text,
} from '@mantine/core'
import {
    IconActivity,
    IconAdjustments,
    IconChevronLeft,
    IconChevronRight,
    IconDroplet,
    IconHeartRateMonitor,
    IconMoon,
    IconPlugConnected,
    IconScale,
    IconSparkles,
    IconTargetArrow,
    IconX,
} from '@tabler/icons-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { DailyNutritionPanel } from '../components/DailyNutritionPanel'
import { JournalEventList } from '../components/JournalEventList'
import { MetricCard } from '../components/MetricCard'
import { WeeklyReflection } from '../components/WeeklyReflection'
import type { LogActionId } from '../logging/logActions'
import { displayValue, type Observation } from '../domain/health'
import { formatMetric, type MetricPreferences } from '../domain/metrics'
import type { JournalEvent } from '../domain/types'
import { useTodayHealth } from '../hooks/useTodayHealth'
import { updatePreferences, type DashboardCard } from '../lib/preferencesApi'

const reading = (
    record: Observation | null,
    metricPreferences?: MetricPreferences,
    empty = 'No reading today',
) => {
    if (!record) return empty
    return formatMetric(record.metric, record.canonicalValue, metricPreferences)
}

const rollingAverageChange = (
    current: Observation,
    baseline: { baseline: number; sampleSize: number; unit: string } | null,
    units: 'metric' | 'imperial' = 'metric',
) => {
    if (!baseline) return null
    const displayUnit =
        units === 'imperial' && current.canonicalUnit === 'kg' ? 'lb' : current.canonicalUnit
    const currentValue = displayValue(current.canonicalValue, current.canonicalUnit, displayUnit)
    const baselineInCanonicalUnit =
        baseline.unit === current.canonicalUnit
            ? baseline.baseline
            : baseline.unit === 'hours' && current.canonicalUnit === 'minutes'
              ? baseline.baseline * 60
              : baseline.unit === 'minutes' && current.canonicalUnit === 'hours'
                ? baseline.baseline / 60
                : displayValue(baseline.baseline, baseline.unit, current.canonicalUnit)
    const average = displayValue(baselineInCanonicalUnit, current.canonicalUnit, displayUnit)
    const delta = currentValue - average
    const averageLabel = `${baseline.sampleSize}-day rolling average`
    if (Math.abs(delta) < 0.01) return `In line with your ${averageLabel}`
    const amount =
        Math.abs(delta).toLocaleString(undefined, { maximumFractionDigits: 1 }) + ` ${displayUnit}`
    return `${amount} ${delta > 0 ? 'higher' : 'lower'} than your ${averageLabel}`
}

const isCumulativeGoal = (goal: ReturnType<typeof useTodayHealth>['stepsGoal']) =>
    Boolean(
        goal &&
        goal.aggregation === 'total' &&
        goal.period.type === 'day' &&
        goal.comparator === 'gte' &&
        'value' in goal.target,
    )

export function Today({
    events,
    insight,
    dismissInsight,
    openJournal,
    openTrends,
    openConnections,
    openGoals,
    openLogger,
    onSelectedDateChange,
    initialSelectedDate,
}: {
    events: JournalEvent[]
    insight: boolean
    dismissInsight: () => void
    openJournal: () => void
    openTrends: () => void
    openConnections?: () => void
    openGoals?: () => void
    openLogger?: (kind: LogActionId) => void
    onSelectedDateChange?: (date: string) => void
    initialSelectedDate?: string | null
}) {
    const [selectedDate, setSelectedDate] = useState(() =>
        initialSelectedDate ? new Date(`${initialSelectedDate}T12:00:00`) : new Date(),
    )
    const [customizing, setCustomizing] = useState(false)
    const [savingCards, setSavingCards] = useState(false)
    const health = useTodayHealth(selectedDate)
    const now = selectedDate
    const calendarToday = new Date()
    const isToday = now.toDateString() === calendarToday.toDateString()
    const changeDay = (offset: number) => {
        setSelectedDate(current => {
            const next = new Date(current)
            next.setDate(next.getDate() + offset)
            return next
        })
    }
    useEffect(() => {
        onSelectedDateChange?.(
            `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`,
        )
    }, [onSelectedDateChange, selectedDate])
    const locale = health.preferences?.locale
    const timezone = health.preferences?.timezone
    const localHour = Number(
        new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hourCycle: 'h23',
        }).format(now),
    )
    const stepsTarget =
        health.stepsGoal?.target && 'value' in health.stepsGoal.target
            ? health.stepsGoal.target.value
            : undefined
    const waterTarget =
        health.waterGoal?.target && 'value' in health.waterGoal.target
            ? health.waterGoal.target.value
            : undefined
    const stepsEvaluation = health.stepsGoal
        ? health.goalEvaluations?.[health.stepsGoal.id]
        : undefined
    const waterEvaluation = health.waterGoal
        ? health.goalEvaluations?.[health.waterGoal.id]
        : undefined
    const stepsCumulative = isCumulativeGoal(health.stepsGoal)
    const waterCumulative = isCumulativeGoal(health.waterGoal)
    const sleepPointCount = health.sleepSeries.filter(point => point.sleep !== null).length
    const defaultCards: DashboardCard[] = [
        'sleep',
        'heart',
        'energy',
        'weight',
        'progress',
        'trend',
        'journal',
    ]
    const visibleCards = health.preferences?.experience?.visibleCards ?? defaultCards
    const [draftCards, setDraftCards] = useState<DashboardCard[]>(visibleCards)
    const visible = (card: DashboardCard) => visibleCards.includes(card)
    const missingCount = [
        health.sleepToday,
        health.restingHeartRate,
        health.energy,
        health.weight,
    ].filter(value => !value).length
    const dailySummary = health.unavailable
        ? 'Your health data needs attention before today can be summarized.'
        : missingCount === 0
          ? 'Your key readings are in. Review how today compares with your recent pattern.'
          : `${missingCount} of your key daily readings ${missingCount === 1 ? 'still needs' : 'still need'} an update.`
    const nextAction = health.unavailable
        ? {
              eyebrow: 'DATA NEEDS ATTENTION',
              title: 'Reconnect your health data',
              detail: 'Review your data sources and restore today’s observations.',
              label: 'Review connections',
              icon: IconPlugConnected,
              run: openConnections,
          }
        : !health.energy
          ? {
                eyebrow: 'NEXT UP',
                title: 'How’s your energy?',
                detail: 'A quick check-in adds context to sleep, activity, and nutrition.',
                label: 'Check in now',
                icon: IconSparkles,
                run: () => openLogger?.('energy'),
            }
          : !health.weight
            ? {
                  eyebrow: 'NEXT UP',
                  title: 'Add today’s weight',
                  detail: 'Log it now if weighing in is part of your routine.',
                  label: 'Add weight',
                  icon: IconScale,
                  run: () => openLogger?.('weight'),
              }
            : !stepsTarget || !waterTarget
              ? {
                    eyebrow: 'PERSONALIZE TODAY',
                    title: 'Make progress more useful',
                    detail: 'Set optional goals for the metrics that matter to you.',
                    label: 'Set goals',
                    icon: IconTargetArrow,
                    run: openGoals,
                }
              : {
                    eyebrow: 'TODAY IS UP TO DATE',
                    title: 'See what’s changing',
                    detail: 'Explore your recent patterns and recorded context.',
                    label: 'Review trends',
                    icon: IconActivity,
                    run: openTrends,
                }
    const NextActionIcon = nextAction.icon

    return (
        <div className="page-content">
            <section className="welcome">
                <div>
                    <Text className="date">
                        {now.toLocaleDateString(locale, {
                            timeZone: timezone,
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                        })}
                    </Text>
                    <h1>
                        {isToday
                            ? `Good ${localHour < 12 ? 'morning' : localHour < 18 ? 'afternoon' : 'evening'}`
                            : 'Daily review'}
                        {health.preferences?.displayName &&
                        health.preferences.displayName.toLowerCase() !== 'owner'
                            ? `, ${health.preferences.displayName}.`
                            : '.'}
                    </h1>
                    <Text className="subhead">{dailySummary}</Text>
                </div>
                <div className="day-navigation" aria-label="Choose day">
                    <Button
                        variant="subtle"
                        color="gray"
                        leftSection={<IconAdjustments size={16} />}
                        onClick={() => {
                            setDraftCards(visibleCards)
                            setCustomizing(true)
                        }}
                    >
                        Customize
                    </Button>
                    <ActionIcon
                        variant="default"
                        size="lg"
                        aria-label="Previous day"
                        onClick={() => changeDay(-1)}
                    >
                        <IconChevronLeft size={18} />
                    </ActionIcon>
                    {!isToday && (
                        <Button variant="default" onClick={() => setSelectedDate(new Date())}>
                            Today
                        </Button>
                    )}
                    <ActionIcon
                        variant="default"
                        size="lg"
                        aria-label="Next day"
                        disabled={isToday}
                        onClick={() => changeDay(1)}
                    >
                        <IconChevronRight size={18} />
                    </ActionIcon>
                </div>
            </section>
            {!health.loading &&
                (!health.sleepBaseline ||
                    health.unavailable ||
                    !health.energy ||
                    !health.weight) && (
                    <section className="next-action" aria-labelledby="next-action-title">
                        <div className="next-action-icon">
                            <NextActionIcon size={22} />
                        </div>
                        <div className="next-action-copy">
                            <Text className="eyebrow teal-text">{nextAction.eyebrow}</Text>
                            <h2 id="next-action-title">{nextAction.title}</h2>
                            <Text size="sm">{nextAction.detail}</Text>
                        </div>
                        <Button color="trackit" onClick={nextAction.run} disabled={!nextAction.run}>
                            {nextAction.label}
                        </Button>
                        {health.unavailable && openLogger && (
                            <Button
                                className="manual-use-action"
                                variant="subtle"
                                color="gray"
                                onClick={() => openLogger('energy')}
                            >
                                Add a manual check-in instead
                            </Button>
                        )}
                    </section>
                )}
            {insight && health.sleepBaseline && (
                <section className="insight">
                    <div className="insight-icon">
                        <IconSparkles size={20} />
                    </div>
                    <div>
                        <Text className="eyebrow teal-text">TODAY&apos;S NOTE</Text>
                        <Text fw={650}>
                            Your sleep was{' '}
                            {Math.abs(
                                Math.round(
                                    health.sleepToday?.canonicalUnit === 'hours'
                                        ? health.sleepBaseline.delta * 60
                                        : health.sleepBaseline.delta,
                                ),
                            )}{' '}
                            minutes {health.sleepBaseline.delta >= 0 ? 'longer' : 'shorter'} than
                            your rolling baseline.
                        </Text>
                        <Text size="sm" c="dimmed">
                            Calculated from {health.sleepBaseline.sampleSize} recorded days; missing
                            days are excluded.
                        </Text>
                    </div>
                    <ActionIcon
                        aria-label="Dismiss insight"
                        onClick={dismissInsight}
                        variant="subtle"
                        color="gray"
                        className="insight-close"
                    >
                        <IconX size={17} />
                    </ActionIcon>
                </section>
            )}
            {health.loading ? (
                <Skeleton
                    role="status"
                    height={124}
                    radius="lg"
                    aria-label="Loading today health data"
                />
            ) : (
                <section className="metric-grid">
                    {visible('sleep') && (
                        <MetricCard
                            icon={IconMoon}
                            tone="indigo"
                            label="Sleep"
                            record={health.sleepToday}
                            value={reading(
                                health.sleepToday,
                                health.preferences?.metricPreferences,
                                'No sleep record',
                            )}
                            note={
                                health.sleepToday
                                    ? rollingAverageChange(health.sleepToday, health.sleepBaseline)
                                    : 'No sleep imported today'
                            }
                            action={
                                health.sleepToday
                                    ? undefined
                                    : {
                                          label: 'Connect sleep data',
                                          onClick: openConnections ?? (() => {}),
                                      }
                            }
                        />
                    )}
                    {visible('heart') && (
                        <MetricCard
                            icon={IconHeartRateMonitor}
                            tone="rose"
                            label="Resting heart rate"
                            record={health.restingHeartRate}
                            value={reading(
                                health.restingHeartRate,
                                health.preferences?.metricPreferences,
                            )}
                            note={
                                health.restingHeartRate
                                    ? rollingAverageChange(
                                          health.restingHeartRate,
                                          health.restingBaseline,
                                      )
                                    : 'No baseline available'
                            }
                            action={
                                health.restingHeartRate
                                    ? undefined
                                    : {
                                          label: 'Connect heart data',
                                          onClick: openConnections ?? (() => {}),
                                      }
                            }
                        />
                    )}
                    {visible('energy') && (
                        <MetricCard
                            icon={IconSparkles}
                            tone="violet"
                            label="Energy"
                            record={health.energy}
                            value={reading(health.energy, health.preferences?.metricPreferences)}
                            note={
                                health.energy
                                    ? rollingAverageChange(health.energy, health.energyBaseline)
                                    : 'No check-in today'
                            }
                            action={
                                health.energy
                                    ? undefined
                                    : {
                                          label: 'How’s your energy?',
                                          onClick: () => openLogger?.('energy'),
                                      }
                            }
                        />
                    )}
                    {visible('weight') && (
                        <MetricCard
                            icon={IconScale}
                            tone="blue"
                            label="Weight"
                            record={health.weight}
                            value={reading(health.weight, health.preferences?.metricPreferences)}
                            note={
                                health.weight
                                    ? rollingAverageChange(
                                          health.weight,
                                          health.weightBaseline,
                                          health.preferences?.units,
                                      )
                                    : 'No weight reading today'
                            }
                            action={
                                health.weight
                                    ? undefined
                                    : { label: 'Add weight', onClick: () => openLogger?.('weight') }
                            }
                        />
                    )}
                </section>
            )}
            <section className="dashboard-grid">
                {visible('progress') && (
                    <article className="panel movement">
                        <div className="panel-head">
                            <div>
                                <h2>Today’s progress</h2>
                                <Text size="xs" c="dimmed">
                                    Daily totals against your optional goals
                                </Text>
                            </div>
                            <Button
                                onClick={openTrends}
                                variant="subtle"
                                color="gray"
                                size="xs"
                                rightSection={<IconChevronRight size={14} />}
                            >
                                View trends
                            </Button>
                        </div>
                        <div className="progress-row">
                            <div className="progress-label">
                                <span>
                                    <IconActivity size={18} />
                                    Steps
                                </span>
                                <strong>
                                    {health.steps.toLocaleString()}
                                    <small>
                                        {stepsTarget
                                            ? stepsCumulative
                                                ? `of ${stepsTarget.toLocaleString()}`
                                                : 'general goal'
                                            : 'no goal set'}
                                    </small>
                                </strong>
                            </div>
                            {stepsTarget && stepsCumulative ? (
                                <Progress
                                    value={(stepsEvaluation?.progress ?? 0) * 100}
                                    color="trackit"
                                    radius="xl"
                                    size="sm"
                                    aria-label="Daily steps progress"
                                />
                            ) : health.stepsGoal ? (
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    size="compact-sm"
                                    onClick={openGoals}
                                >
                                    View steps goal
                                </Button>
                            ) : (
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    size="compact-sm"
                                    onClick={openGoals}
                                >
                                    Set a steps goal
                                </Button>
                            )}
                        </div>
                        <div className="progress-row">
                            <div className="progress-label">
                                <span>
                                    <IconDroplet size={18} />
                                    Water
                                </span>
                                <strong>
                                    {health.water.toLocaleString()} ml
                                    <small>
                                        {waterTarget
                                            ? waterCumulative
                                                ? `of ${waterTarget.toLocaleString()} ${health.waterGoal?.canonicalUnit ?? ''}`
                                                : 'general goal'
                                            : 'no goal set'}
                                    </small>
                                </strong>
                            </div>
                            {waterTarget && waterCumulative ? (
                                <Progress
                                    value={(waterEvaluation?.progress ?? 0) * 100}
                                    color="cyan"
                                    radius="xl"
                                    size="sm"
                                    aria-label="Daily water progress"
                                />
                            ) : health.waterGoal ? (
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    size="compact-sm"
                                    onClick={openGoals}
                                >
                                    View water goal
                                </Button>
                            ) : (
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    size="compact-sm"
                                    onClick={openGoals}
                                >
                                    Set a water goal
                                </Button>
                            )}
                        </div>
                        <DailyNutritionPanel openGoals={openGoals} selectedDate={selectedDate} />
                    </article>
                )}
                {visible('trend') && (
                    <article className="panel mini-chart">
                        <div className="panel-head">
                            <div>
                                <Text className="eyebrow">PAST 7 DAYS</Text>
                                <h2>Sleep duration</h2>
                            </div>
                            {health.sleepBaseline && (
                                <Badge variant="light" color="trackit">
                                    {health.sleepBaseline.delta >= 0 ? '+' : ''}
                                    {health.sleepToday?.canonicalUnit === 'hours'
                                        ? `${Math.round(health.sleepBaseline.delta * 60)}m`
                                        : `${Math.round(health.sleepBaseline.delta)}m`}
                                </Badge>
                            )}
                        </div>
                        {sleepPointCount >= 2 ? (
                            <ResponsiveContainer width="100%" height={155}>
                                <AreaChart
                                    data={health.sleepSeries}
                                    margin={{ top: 12, right: 5, left: -30, bottom: 0 }}
                                >
                                    <CartesianGrid vertical={false} stroke="#ebe9e1" />
                                    <XAxis dataKey="day" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Area
                                        type="monotone"
                                        dataKey="sleep"
                                        connectNulls={false}
                                        stroke="#38645e"
                                        fill="#486f6947"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="chart-empty">
                                <IconMoon size={24} />
                                <Text fw={650}>
                                    {sleepPointCount === 1
                                        ? 'One night recorded'
                                        : 'No sleep trend yet'}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {sleepPointCount === 1
                                        ? 'Add one more night to begin comparing sleep.'
                                        : 'Import sleep on at least two days to see a trend.'}
                                </Text>
                                <Button
                                    variant="light"
                                    color="trackit"
                                    size="xs"
                                    onClick={openConnections}
                                >
                                    Connect sleep data
                                </Button>
                            </div>
                        )}
                    </article>
                )}
            </section>
            {visible('journal') && (
                <section className="panel timeline">
                    <div className="panel-head">
                        <div>
                            <Text className="eyebrow">JOURNAL</Text>
                            <h2>Your timeline</h2>
                        </div>
                        <Button onClick={openJournal} variant="subtle" color="teal" size="xs">
                            View all
                        </Button>
                    </div>
                    <JournalEventList events={events.slice(0, 3)} showChevron />
                </section>
            )}
            {isToday && <WeeklyReflection events={events} openJournal={openJournal} />}
            <Modal
                opened={customizing}
                onClose={() => setCustomizing(false)}
                title="Customize Today"
                centered
            >
                <Text size="sm" c="dimmed" mb="md">
                    Choose what deserves space on your dashboard. Your selection is saved on your
                    TrackIt server.
                </Text>
                <div className="dashboard-card-options">
                    {(
                        [
                            ['sleep', 'Sleep'],
                            ['heart', 'Resting heart rate'],
                            ['energy', 'Energy'],
                            ['weight', 'Weight'],
                            ['progress', 'Daily progress'],
                            ['trend', 'Sleep trend'],
                            ['journal', 'Recent journal'],
                        ] as Array<[DashboardCard, string]>
                    ).map(([value, label]) => (
                        <Checkbox
                            key={value}
                            label={label}
                            checked={draftCards.includes(value)}
                            onChange={event =>
                                setDraftCards(current =>
                                    event.currentTarget.checked
                                        ? [...current, value]
                                        : current.filter(card => card !== value),
                                )
                            }
                        />
                    ))}
                </div>
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={() => setCustomizing(false)}>
                        Cancel
                    </Button>
                    <Button
                        loading={savingCards}
                        disabled={draftCards.length === 0}
                        onClick={async () => {
                            if (!health.preferences) return
                            setSavingCards(true)
                            try {
                                await updatePreferences({
                                    experience: {
                                        ...health.preferences.experience,
                                        visibleCards: draftCards,
                                    },
                                })
                                setCustomizing(false)
                            } finally {
                                setSavingCards(false)
                            }
                        }}
                    >
                        Save dashboard
                    </Button>
                </Group>
            </Modal>
        </div>
    )
}
