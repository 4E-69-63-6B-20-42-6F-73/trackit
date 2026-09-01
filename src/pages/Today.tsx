import { ActionIcon, Button, Group, Progress, Skeleton, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
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
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DailyNutritionPanel } from '../components/DailyNutritionPanel'
import { JournalEntryDetailModal } from '../components/JournalEntryDetailModal'
import { JournalEventList } from '../components/JournalEventList'
import { TodayGoalsSkeleton } from '../components/LoadingSkeletons'
import { MetricCard } from '../components/MetricCard'
import {
    addCalendarDays,
    calendarDateFromKey,
    calendarTodayKey,
    formatCalendarDate,
} from '../domain/calendar'
import { metricDefinition, type MetricCategory } from '../domain/metricCatalog'
import { formatMetric, type MetricPreferences } from '../domain/metrics'
import type { JournalEvent } from '../domain/types'
import type { ServerStatus } from '../hooks/useJournal'
import { useServerData } from '../hooks/useServerData'
import { useTodayHealth } from '../hooks/useTodayHealth'
import { listJournal } from '../lib/journalApi'
import { serverQueryKeys } from '../lib/serverQueries'

const metricVisual: Record<
    Exclude<MetricCategory, 'Nutrition'>,
    { icon: typeof IconMoon; tone: string }
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

type TodayProps = {
    events: JournalEvent[]
    journalStatus: ServerStatus
    openJournal: (date: string) => void
    openTrends: (definitionId?: string) => void
    openConnections?: () => void
    openGoals?: () => void
    initialSelectedDate?: string | null
}

export function Today({
    events,
    journalStatus,
    openJournal,
    openTrends,
    openConnections,
    openGoals,
    initialSelectedDate,
}: TodayProps) {
    const [params, setParams] = useSearchParams()
    const { preferences: sharedPreferences } = useServerData()
    const timezone = sharedPreferences?.timezone ?? 'UTC'
    const todayKey = calendarTodayKey(timezone)
    const [selectedKey, setSelectedKeyState] = useState(
        initialSelectedDate ?? params.get('date') ?? todayKey,
    )
    const selectedDate = calendarDateFromKey(selectedKey, timezone)
    const health = useTodayHealth(selectedDate)
    const historyQuery = useQuery({
        queryKey: [...serverQueryKeys.journal, 'history-presence'],
        queryFn: ({ signal }) => listJournal({ limit: 1 }, signal),
    })
    const hasHistory = historyQuery.data ? historyQuery.data.length > 0 : null
    const [selectedSleepEvent, setSelectedSleepEvent] = useState<JournalEvent | null>(null)
    const isToday = selectedKey === todayKey
    const locale = health.preferences?.locale
    const detailedSleepEvent =
        events.find(
            event =>
                event.definitionId === 'sleep' &&
                event.detailView?.kind === 'sleep' &&
                event.detailView.stages.length > 0,
        ) ?? null

    const setSelectedKey = (next: string) => {
        const bounded = next > todayKey ? todayKey : next
        setSelectedKeyState(bounded)
        setSelectedSleepEvent(null)
        const search = new URLSearchParams(params)
        if (bounded === todayKey) search.delete('date')
        else search.set('date', bounded)
        setParams(search, { replace: true })
    }

    const localHour = Number(
        new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hourCycle: 'h23',
        }).format(new Date()),
    )
    const selectedDateLabel = formatCalendarDate(selectedKey, locale)
    const coldStart =
        isToday &&
        hasHistory === false &&
        journalStatus === 'online' &&
        !health.loading &&
        !health.unavailable &&
        events.length === 0 &&
        health.summaryMetrics.length === 0

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
                            onClick={() => setSelectedKey(addCalendarDays(selectedKey, -1))}
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
                                onChange={event =>
                                    event.currentTarget.value &&
                                    setSelectedKey(event.currentTarget.value)
                                }
                            />
                        </label>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label="Next day"
                            disabled={isToday}
                            onClick={() => setSelectedKey(addCalendarDays(selectedKey, 1))}
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
                                onClick={() => setSelectedKey(todayKey)}
                            >
                                Today
                            </Button>
                        )}
                    </div>
                </div>
            </section>

            {coldStart ? (
                <section className="panel today-get-started">
                    <h2>Start building your health record</h2>
                    <Text c="dimmed" mb="lg">
                        TrackIt becomes useful as soon as it has observations. Log something
                        yourself or connect a source to import existing data.
                    </Text>
                    <Group>
                        <Button
                            color="trackit"
                            onClick={() => window.dispatchEvent(new Event('trackit:open-log-menu'))}
                        >
                            Log first observation
                        </Button>
                        {openConnections && (
                            <Button variant="default" onClick={openConnections}>
                                Connect a source
                            </Button>
                        )}
                    </Group>
                </section>
            ) : (
                <>
                    {health.unavailable && (
                        <section
                            className="today-attention"
                            aria-labelledby="today-attention-title"
                        >
                            <div className="today-attention-icon">
                                <IconPlugConnected size={20} />
                            </div>
                            <div>
                                <Text fw={700} size="xs" c="teal">
                                    ATTENTION
                                </Text>
                                <h2 id="today-attention-title">Some health data is unavailable</h2>
                                <Text size="sm">
                                    Review Connections if this day is missing data you expected to
                                    see.
                                </Text>
                            </div>
                            {openConnections && (
                                <Button color="trackit" onClick={openConnections}>
                                    Review Connections
                                </Button>
                            )}
                        </section>
                    )}

                    <div className="today-section-heading">
                        <div>
                            <h2>At a glance</h2>
                            <Text size="xs" c="dimmed">
                                Key observations for this day, with recent context.
                            </Text>
                        </div>
                        <Button
                            onClick={() => openTrends()}
                            variant="subtle"
                            color="trackit"
                            size="xs"
                        >
                            View all trends
                        </Button>
                    </div>
                    {health.loading ? (
                        <Skeleton
                            role="status"
                            height={150}
                            radius="lg"
                            aria-label="Loading daily summary"
                        />
                    ) : health.unavailable ? (
                        <section className="panel today-empty-summary">
                            <Text fw={650}>Daily summary unavailable</Text>
                            <Text size="sm" c="dimmed">
                                TrackIt could not load the observations needed for this summary.
                            </Text>
                        </section>
                    ) : health.summaryMetrics.length > 0 ? (
                        <section className="metric-grid">
                            {health.summaryMetrics.map(metric => {
                                const visual =
                                    metricVisual[
                                        metric.definition.category as Exclude<
                                            MetricCategory,
                                            'Nutrition'
                                        >
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
                                        onOpenDetails={
                                            metric.definition.id === 'sleep' && detailedSleepEvent
                                                ? () => setSelectedSleepEvent(detailedSleepEvent)
                                                : undefined
                                        }
                                        onViewTrend={() => openTrends(metric.definition.id)}
                                        locale={locale}
                                        timezone={timezone}
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
                            <h2>Goals</h2>
                            <Text size="xs" c="dimmed">
                                Active daily goals for this day.
                            </Text>
                        </div>
                        {openGoals && (
                            <Button onClick={openGoals} variant="subtle" color="trackit" size="xs">
                                View goals
                            </Button>
                        )}
                    </div>
                    <article className="panel today-goals">
                        {health.loading ? (
                            <TodayGoalsSkeleton />
                        ) : health.unavailable ? (
                            <Stack gap={4}>
                                <Text fw={650}>Goal status unavailable</Text>
                                <Text size="sm" c="dimmed">
                                    TrackIt could not load goal progress for this day.
                                </Text>
                            </Stack>
                        ) : health.dailyGoals.length > 0 ? (
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
                                            <Text fw={650}>
                                                {definition?.name ?? goal.metricId}
                                            </Text>
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
                                            <Text
                                                size="xs"
                                                fw={650}
                                                c={evaluation?.met ? 'teal' : 'dimmed'}
                                            >
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
                            <Stack gap={4}>
                                <Text fw={650}>No daily goals active</Text>
                                <Text size="sm" c="dimmed">
                                    Goals are optional. Add one when there is something you want to
                                    track against.
                                </Text>
                            </Stack>
                        )}
                    </article>

                    <div className="today-section-heading">
                        <div>
                            <h2>Nutrition</h2>
                            <Text size="xs" c="dimmed">
                                Meals and nutrient totals recorded for this day.
                            </Text>
                        </div>
                    </div>
                    <article className="panel today-nutrition">
                        <DailyNutritionPanel openGoals={openGoals} selectedDate={selectedDate} />
                    </article>

                    <section className="panel timeline today-timeline">
                        <div className="panel-head">
                            <h2>Journal</h2>
                            <Button
                                onClick={() => openJournal(selectedKey)}
                                variant="subtle"
                                color="trackit"
                                size="xs"
                            >
                                View this day
                            </Button>
                        </div>
                        {journalStatus === 'connecting' ? (
                            <Skeleton
                                role="status"
                                height={96}
                                radius="md"
                                aria-label="Loading Journal entries"
                            />
                        ) : journalStatus === 'offline' ? (
                            <div className="today-empty-journal">
                                <Text fw={650}>Journal entries unavailable</Text>
                                <Text size="sm" c="dimmed">
                                    TrackIt could not load the Journal for this day.
                                </Text>
                            </div>
                        ) : events.length > 0 ? (
                            <JournalEventList events={events.slice(0, 3)} showChevron />
                        ) : (
                            <div className="today-empty-journal">
                                <Text fw={650}>No Journal entries for this day</Text>
                                <Text size="sm" c="dimmed">
                                    Logged and synced observations will appear here in chronological
                                    order.
                                </Text>
                            </div>
                        )}
                    </section>
                </>
            )}
            <JournalEntryDetailModal
                event={selectedSleepEvent}
                onClose={() => setSelectedSleepEvent(null)}
            />
        </div>
    )
}
