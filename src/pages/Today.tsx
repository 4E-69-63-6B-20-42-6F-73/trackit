import { ActionIcon, Alert, Badge, Button, Progress, Skeleton, Text } from '@mantine/core'
import {
    IconActivity,
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
import { MetricCard } from '../components/MetricCard'
import type { QuickAddKind } from '../components/QuickAdd'
import { eventVisual } from '../domain/data'
import { displayValue, type Observation } from '../domain/health'
import type { JournalEvent } from '../domain/types'
import { useTodayHealth } from '../hooks/useTodayHealth'

const reading = (
    record: Observation | null,
    units: 'metric' | 'imperial' = 'metric',
    empty = 'No reading today',
) => {
    if (!record) return empty
    const displayUnit =
        units === 'imperial' && record.canonicalUnit === 'kg' ? 'lb' : record.canonicalUnit
    const value = displayValue(record.canonicalValue, record.canonicalUnit, displayUnit)
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${displayUnit}`
}

const sleepReading = (record: Observation | null) => {
    if (!record) return 'No sleep record'
    const value = Math.round(
        record.canonicalUnit === 'hours' ? record.canonicalValue * 60 : record.canonicalValue,
    )
    return `${Math.floor(value / 60)}h ${value % 60}m`
}

const percentage = (value: number, target?: number) =>
    target && target > 0 ? Math.min(100, (value / target) * 100) : 0

export function Today({
    events,
    insight,
    dismissInsight,
    openJournal,
    openTrends,
    openConnections,
    openGoals,
    quickAdd,
}: {
    events: JournalEvent[]
    insight: boolean
    dismissInsight: () => void
    openJournal: () => void
    openTrends: () => void
    openConnections?: () => void
    openGoals?: () => void
    quickAdd?: (kind: QuickAddKind) => void
}) {
    const health = useTodayHealth()
    const now = new Date()
    const locale = health.preferences?.locale
    const timezone = health.preferences?.timezone
    const localHour = Number(
        new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hourCycle: 'h23',
        }).format(now),
    )
    const stepsTarget = health.stepsGoal?.targetValue
    const waterTarget = health.waterGoal?.targetValue
    const sleepPointCount = health.sleepSeries.filter(point => point.sleep !== null).length
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
                run: () => quickAdd?.('Check-in'),
            }
          : !health.weight
            ? {
                  eyebrow: 'NEXT UP',
                  title: 'Add today’s weight',
                  detail: 'Log it now if weighing in is part of your routine.',
                  label: 'Add weight',
                  icon: IconScale,
                  run: () => quickAdd?.('Weight'),
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
                        Good {localHour < 12 ? 'morning' : localHour < 18 ? 'afternoon' : 'evening'}
                        {health.preferences?.displayName &&
                        health.preferences.displayName.toLowerCase() !== 'owner'
                            ? `, ${health.preferences.displayName}.`
                            : '.'}
                    </h1>
                    <Text className="subhead">{dailySummary}</Text>
                </div>
            </section>
            {health.unavailable && (
                <Alert
                    color="orange"
                    title="Health data is unavailable"
                    styles={{ title: { color: '#7a2e0b' } }}
                >
                    TrackIt could not load your observations. No representative values are shown.
                </Alert>
            )}
            {!health.loading && (
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
                    <MetricCard
                        icon={IconMoon}
                        tone="indigo"
                        label="Sleep"
                        value={sleepReading(health.sleepToday)}
                        note={
                            health.sleepToday ? 'Latest recorded sleep' : 'No sleep imported today'
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
                    <MetricCard
                        icon={IconHeartRateMonitor}
                        tone="rose"
                        label="Resting heart rate"
                        value={reading(health.restingHeartRate)}
                        note={
                            health.restingBaseline
                                ? `${Math.abs(Math.round(health.restingBaseline.delta))} bpm ${health.restingBaseline.delta <= 0 ? 'below' : 'above'} baseline`
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
                    <MetricCard
                        icon={IconSparkles}
                        tone="violet"
                        label="Energy"
                        value={reading(health.energy)}
                        note="Latest check-in today"
                        action={
                            health.energy
                                ? undefined
                                : {
                                      label: 'How’s your energy?',
                                      onClick: () => quickAdd?.('Check-in'),
                                  }
                        }
                    />
                    <MetricCard
                        icon={IconScale}
                        tone="blue"
                        label="Weight"
                        value={reading(health.weight, health.preferences?.units)}
                        note="Latest reading today"
                        action={
                            health.weight
                                ? undefined
                                : { label: 'Add weight', onClick: () => quickAdd?.('Weight') }
                        }
                    />
                </section>
            )}
            <section className="dashboard-grid">
                <article className="panel movement">
                    <div className="panel-head">
                        <div>
                            <Text className="eyebrow">TODAY</Text>
                            <h2>Daily rhythm</h2>
                        </div>
                        <Button
                            onClick={openTrends}
                            variant="subtle"
                            color="gray"
                            size="xs"
                            rightSection={<IconChevronRight size={14} />}
                        >
                            Details
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
                                        ? `of ${stepsTarget.toLocaleString()}`
                                        : 'no goal set'}
                                </small>
                            </strong>
                        </div>
                        {stepsTarget ? (
                            <Progress
                                value={percentage(health.steps, stepsTarget)}
                                color="trackit"
                                radius="xl"
                                size="sm"
                                aria-label="Daily steps progress"
                            />
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
                                        ? `of ${waterTarget.toLocaleString()} ${health.waterGoal?.canonicalUnit ?? ''}`
                                        : 'no goal set'}
                                </small>
                            </strong>
                        </div>
                        {waterTarget ? (
                            <Progress
                                value={percentage(health.water, waterTarget)}
                                color="cyan"
                                radius="xl"
                                size="sm"
                                aria-label="Daily water progress"
                            />
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
                    <DailyNutritionPanel />
                </article>
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
            </section>
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
                {events.slice(0, 3).map(event => {
                    const { icon: Icon, tone } = eventVisual(event.category)
                    return (
                        <div className="event" key={event.id}>
                            <time>{event.time}</time>
                            <div className={`event-icon ${tone}`}>
                                <Icon size={17} />
                            </div>
                            <div className="event-copy">
                                <Text fw={600} size="sm">
                                    {event.title}
                                </Text>
                                <Text size="sm" c="dimmed">
                                    {event.detail}
                                </Text>
                            </div>
                            {event.source !== 'You' && (
                                <Badge variant="light" color="gray" fw={500}>
                                    {event.source}
                                </Badge>
                            )}
                            <IconChevronRight size={17} color="#a3a49e" />
                        </div>
                    )
                })}
            </section>
        </div>
    )
}
