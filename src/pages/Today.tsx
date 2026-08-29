import { ActionIcon, Button, Progress, Skeleton, Text } from '@mantine/core'
import {
    IconActivity,
    IconChevronLeft,
    IconChevronRight,
    IconHeartRateMonitor,
    IconMoon,
    IconPlugConnected,
    IconScale,
    IconSparkles,
} from '@tabler/icons-react'
import { useEffect, type ComponentType } from 'react'
import { DailyNutritionPanel } from '../components/DailyNutritionPanel'
import { JournalEventList } from '../components/JournalEventList'
import { MetricCard } from '../components/MetricCard'
import { metricDefinition, type MetricCategory } from '../domain/metricCatalog'
import { formatMetric, type MetricPreferences } from '../domain/metrics'
import type { JournalEvent } from '../domain/types'
import { useTodayHealth } from '../hooks/useTodayHealth'

const localDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const metricVisual: Record<
    Exclude<MetricCategory, 'Nutrition'>,
    { icon: ComponentType<{ size?: number; stroke?: number }>; tone: string }
> = {
    Activity: { icon: IconActivity, tone: 'green' },
    Body: { icon: IconScale, tone: 'blue' },
    Health: { icon: IconHeartRateMonitor, tone: 'rose' },
    Sleep: { icon: IconMoon, tone: 'indigo' },
    Wellbeing: { icon: IconSparkles, tone: 'violet' },
}

const comparisonNote = (
    definitionId: string,
    baseline: { baseline: number; sampleSize: number; unit: string } | null,
    currentValue: number,
    metricPreferences?: MetricPreferences,
    locale?: string,
) => {
    if (!baseline) return 'No recent baseline yet'
    const delta = currentValue - baseline.baseline
    const threshold = Math.max(Math.abs(baseline.baseline) * 0.01, 0.01)
    const averageLabel = `${baseline.sampleSize}-day average`
    if (Math.abs(delta) <= threshold) return `In line with your ${averageLabel}`
    const amount = formatMetric(definitionId, Math.abs(delta), metricPreferences, locale)
    return `${amount} ${delta > 0 ? 'higher' : 'lower'} than your ${averageLabel}`
}

const goalTargetLabel = (
    metricId: string,
    target: { value: number } | { min: number; max: number },
    preferences?: MetricPreferences,
    locale?: string,
) =>
    'value' in target
        ? formatMetric(metricId, target.value, preferences, locale)
        : `${formatMetric(metricId, target.min, preferences, locale)}–${formatMetric(
              metricId,
              target.max,
              preferences,
              locale,
          )}`

export function Today({
    events,
    openJournal,
    openTrends,
    openConnections,
    openGoals,
    onSelectedDateChange,
    initialSelectedDate,
}: {
    events: JournalEvent[]
    openJournal: () => void
    openTrends: () => void
    openConnections?: () => void
    openGoals?: () => void
    onSelectedDateChange?: (date: string) => void
    initialSelectedDate?: string | null
}) {
    const [selectedDate, setSelectedDate] = React.useState(() =>
        initialSelectedDate ? new Date(`${initialSelectedDate}T12:00:00`) : new Date(),
    )
    const health = useTodayHealth(selectedDate)
    const calendarToday = new Date()
    const selectedKey = localDateKey(selectedDate)
    const todayKey = localDateKey(calendarToday)
    const isToday = selectedKey === todayKey
    const locale = health.preferences?.locale
    const timezone = health.preferences?.timezone
    const localHour = Number(
        new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hourCycle: 'h23',
        }).format(calendarToday),
    )
    const selectedDateLabel = selectedDate.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    })

    const changeDay = (offset: number) => {
        setSelectedDate(current => {
            const next = new Date(current)
            next.setDate(next.getDate() + offset)
            return next
        })
    }

    useEffect(() => onSelectedDateChange?.(selectedKey), [onSelectedDateChange, selectedKey])

    const comparableMetrics = health.summaryMetrics.filter(metric => metric.baseline)
    const summaryTitle = health.unavailable
        ? 'This day may be incomplete.'
        : health.summaryMetrics.length === 0
          ? 'Not much was recorded for this day.'
          : comparableMetrics.length >= 2
            ? 'Your recorded metrics are broadly in line with recent patterns.'
            : 'Here’s what was recorded for this day.'
    const summaryText = health.unavailable
        ? 'Some TrackIt data could not be loaded. The values below show what is currently available.'
        : health.summaryMetrics.length === 0
          ? 'There are no key daily metric summaries yet. Journal entries and nutrition can still give this day useful context.'
          : `TrackIt summarized ${health.summaryMetrics.length} key ${health.summaryMetrics.length === 1 ? 'metric' : 'metrics'} for this day and compared them with recent data where enough history exists.`

    return (
        <div className="page-content today-page">
            <section className="welcome today-welcome">
                <div>
                    <h1>
                        {isToday
                            ? `Good ${localHour < 12 ? 'morning' : localHour < 18 ? 'afternoon' : 'evening'}`
                            : 'Daily review'}
                        {isToday &&
                        health.preferences?.displayName &&
                        health.preferences.displayName.toLowerCase() !== 'owner'
                            ? `, ${health.preferences.displayName}.`
                            : '.'}
                    </h1>
                    <Text className="subhead">
                        {isToday
                            ? 'A summary of what has been recorded today.'
                            : 'A summary of what was recorded on this day.'}
                    </Text>
                </div>
                <div className="today-day-navigation" aria-label="Choose day">
                    <div className="today-day-selector">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Previous day"
                            onClick={() => changeDay(-1)}
                        >
                            <IconChevronLeft size={17} />
                        </ActionIcon>
                        <label className="today-date-control">
                            <span>{isToday ? 'Today' : selectedDateLabel}</span>
                            <input
                                type="date"
                                aria-label="Choose date"
                                value={selectedKey}
                                max={todayKey}
                                onChange={event => {
                                    if (!event.currentTarget.value) return
                                    setSelectedDate(
                                        new Date(`${event.currentTarget.value}T12:00:00`),
                                    )
                                }}
                            />
                        </label>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Next day"
                            disabled={isToday}
                            onClick={() => changeDay(1)}
                        >
                            <IconChevronRight size={17} />
                        </ActionIcon>
                    </div>
                    <div className="today-return-slot">
                        {!isToday && (
                            <Button
                                variant="subtle"
                                color="gray"
                                size="compact-xs"
                                onClick={() => setSelectedDate(new Date())}
                            >
                                Today
                            </Button>
                        )}
                    </div>
                </div>
            </section>

            {health.unavailable && (
                <section className="today-attention" aria-labelledby="today-attention-title">
                    <div className="today-attention-icon">
                        <IconPlugConnected size={20} />
                    </div>
                    <div>
                        <Text className="eyebrow teal-text">ATTENTION</Text>
                        <h2 id="today-attention-title">Some health data is unavailable</h2>
                        <Text size="sm">
                            Review your connections if this day is missing data you expected to see.
                        </Text>
                    </div>
                    {openConnections && (
                        <Button color="trackit" onClick={openConnections}>
                            Review connections
                        </Button>
                    )}
                </section>
            )}

            <section className="panel today-summary">
                <Text className="eyebrow">DAILY SUMMARY</Text>
                <h2>{summaryTitle}</h2>
                <Text>{summaryText}</Text>
            </section>

            <div className="today-section-heading">
                <div>
                    <h2>At a glance</h2>
                    <Text size="xs" c="dimmed">
                        Key observations for this day, with recent context.
                    </Text>
                </div>
                <Button onClick={openTrends} variant="subtle" color="trackit" size="xs">
                    View trends
                </Button>
            </div>
            {health.loading ? (
                <Skeleton
                    role="status"
                    height={150}
                    radius="lg"
                    aria-label="Loading daily summary"
                />
            ) : health.summaryMetrics.length > 0 ? (
                <section className="metric-grid">
                    {health.summaryMetrics.map(metric => {
                        const visual = metricVisual[
                            metric.definition.category as Exclude<MetricCategory, 'Nutrition'>
                        ]
                        const Icon = visual?.icon ?? IconActivity
                        return (
                            <MetricCard
                                key={metric.definition.id}
                                icon={Icon}
                                tone={visual?.tone ?? 'green'}
                                label={metric.definition.name}
                                record={metric.observation}
                                value={formatMetric(
                                    metric.definition.id,
                                    metric.value,
                                    health.preferences?.metricPreferences,
                                    locale,
                                )}
                                note={comparisonNote(
                                    metric.definition.id,
                                    metric.baseline,
                                    metric.value,
                                    health.preferences?.metricPreferences,
                                    locale,
                                )}
                            />
                        )
                    })}
                </section>
            ) : (
                <section className="panel today-empty-summary">
                    <Text fw={650}>No key observations recorded</Text>
                    <Text size="sm" c="dimmed">
                        This day can still contain meals, notes, and other Journal entries.
                    </Text>
                </section>
            )}

            <div className="today-section-heading">
                <div>
                    <h2>Progress</h2>
                    <Text size="xs" c="dimmed">
                        Active daily goals and nutrition for this day.
                    </Text>
                </div>
                {openGoals && (
                    <Button onClick={openGoals} variant="subtle" color="trackit" size="xs">
                        View goals
                    </Button>
                )}
            </div>
            <section className="dashboard-grid today-progress-grid">
                <article className="panel today-goals">
                    {health.dailyGoals.length > 0 ? (
                        health.dailyGoals.slice(0, 4).map(({ goal, evaluation }) => {
                            const definition = metricDefinition(goal.metricId)
                            const value = evaluation?.value
                            const target = goalTargetLabel(
                                goal.metricId,
                                goal.target,
                                health.preferences?.metricPreferences,
                                locale,
                            )
                            return (
                                <div className="today-goal-row" key={goal.id}>
                                    <div className="today-goal-copy">
                                        <Text fw={650}>{definition?.name ?? goal.metricId}</Text>
                                        <Text size="xs" c="dimmed">
                                            {value === null || value === undefined
                                                ? `No data · target ${target}`
                                                : `${formatMetric(
                                                      goal.metricId,
                                                      value,
                                                      health.preferences?.metricPreferences,
                                                      locale,
                                                  )} · target ${target}`}
                                        </Text>
                                    </div>
                                    {evaluation?.progress !== null &&
                                    evaluation?.progress !== undefined ? (
                                        <Progress
                                            className="today-goal-progress"
                                            value={evaluation.progress * 100}
                                            color="trackit"
                                            radius="xl"
                                            size="sm"
                                            aria-label={`${definition?.name ?? goal.metricId} progress`}
                                        />
                                    ) : (
                                        <Text size="xs" fw={650} c={evaluation?.met ? 'teal' : 'dimmed'}>
                                            {evaluation?.met === true
                                                ? 'Goal met'
                                                : evaluation?.met === false
                                                  ? 'Outside target'
                                                  : 'Waiting for data'}
                                        </Text>
                                    )}
                                </div>
                            )
                        })
                    ) : (
                        <div className="today-empty-goals">
                            <Text fw={650}>No daily goals active</Text>
                            <Text size="sm" c="dimmed">
                                Goals are optional. Add one when there is something you want to track
                                against each day.
                            </Text>
                            {openGoals && (
                                <Button
                                    variant="subtle"
                                    color="trackit"
                                    size="compact-sm"
                                    onClick={openGoals}
                                >
                                    View goals
                                </Button>
                            )}
                        </div>
                    )}
                </article>
                <article className="panel today-nutrition">
                    <DailyNutritionPanel openGoals={openGoals} selectedDate={selectedDate} />
                </article>
            </section>

            <section className="panel timeline today-timeline">
                <div className="panel-head">
                    <div>
                        <Text className="eyebrow">JOURNAL</Text>
                        <h2>This day’s timeline</h2>
                    </div>
                    <Button onClick={openJournal} variant="subtle" color="trackit" size="xs">
                        View journal
                    </Button>
                </div>
                {events.length > 0 ? (
                    <JournalEventList events={events.slice(0, 3)} showChevron />
                ) : (
                    <div className="today-empty-journal">
                        <Text fw={650}>No Journal entries for this day</Text>
                        <Text size="sm" c="dimmed">
                            Logged and synced observations will appear here in chronological order.
                        </Text>
                    </div>
                )}
            </section>
        </div>
    )
}
