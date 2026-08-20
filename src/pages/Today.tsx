import { ActionIcon, Badge, Button, Progress, Text } from '@mantine/core'
import {
    IconActivity,
    IconApple,
    IconArrowUpRight,
    IconChevronDown,
    IconChevronRight,
    IconDroplet,
    IconHeartRateMonitor,
    IconMoon,
    IconScale,
    IconSparkles,
    IconX,
} from '@tabler/icons-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as ChartTooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { MetricCard } from '../components/MetricCard'
import { eventVisual, trend } from '../domain/data'
import type { JournalEvent } from '../domain/types'

export function Today({
    events,
    insight,
    dismissInsight,
    openJournal,
}: {
    events: JournalEvent[]
    insight: boolean
    dismissInsight: () => void
    openJournal: () => void
}) {
    return (
        <div className="page-content">
            <section className="welcome">
                <div>
                    <Text className="date">Thursday, 20 August</Text>
                    <h1>Good afternoon, Nick.</h1>
                    <Text className="subhead">Here’s the shape of your day so far.</Text>
                </div>
                <button className="date-button">
                    Today
                    <IconChevronDown size={15} />
                </button>
            </section>
            {insight && (
                <section className="insight">
                    <div className="insight-icon">
                        <IconSparkles size={20} />
                    </div>
                    <div>
                        <Text className="eyebrow teal-text">TODAY’S NOTE</Text>
                        <Text fw={650}>You slept 42 minutes longer than your recent average.</Text>
                        <Text size="sm" c="dimmed">
                            Your resting heart rate is also 3 bpm lower this morning.
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
            <section className="metric-grid">
                <MetricCard
                    icon={IconMoon}
                    tone="indigo"
                    label="Sleep"
                    value="7h 38m"
                    note="91% efficiency"
                    delta="42m"
                />
                <MetricCard
                    icon={IconHeartRateMonitor}
                    tone="rose"
                    label="Resting heart rate"
                    value="58 bpm"
                    note="Your 30-day range: 56–64"
                />
                <MetricCard
                    icon={IconSparkles}
                    tone="violet"
                    label="Energy"
                    value="8 / 10"
                    note="Checked in at 12:40"
                />
                <MetricCard
                    icon={IconScale}
                    tone="blue"
                    label="Weight"
                    value="—"
                    note="No reading today"
                />
            </section>
            <section className="dashboard-grid">
                <article className="panel movement">
                    <div className="panel-head">
                        <div>
                            <Text className="eyebrow">TODAY</Text>
                            <h2>Daily rhythm</h2>
                        </div>
                        <Button
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
                                7,240
                                <small>of 10,000</small>
                            </strong>
                        </div>
                        <Progress value={72.4} color="teal" radius="xl" size="sm" />
                    </div>
                    <div className="progress-row">
                        <div className="progress-label">
                            <span>
                                <IconDroplet size={18} />
                                Water
                            </span>
                            <strong>
                                1.6 L<small>of 2.4 L</small>
                            </strong>
                        </div>
                        <Progress value={67} color="cyan" radius="xl" size="sm" />
                    </div>
                    <div className="progress-row">
                        <div className="progress-label">
                            <span>
                                <IconApple size={18} />
                                Protein
                            </span>
                            <strong>
                                84 g<small>of 115 g</small>
                            </strong>
                        </div>
                        <Progress value={73} color="orange" radius="xl" size="sm" />
                    </div>
                </article>
                <article className="panel mini-chart">
                    <div className="panel-head">
                        <div>
                            <Text className="eyebrow">PAST 7 DAYS</Text>
                            <h2>Sleep duration</h2>
                        </div>
                        <Badge
                            variant="light"
                            color="teal"
                            leftSection={<IconArrowUpRight size={12} />}
                        >
                            +6%
                        </Badge>
                    </div>
                    <ResponsiveContainer width="100%" height={155}>
                        <AreaChart
                            data={trend}
                            margin={{ top: 12, right: 5, left: -30, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="sleep" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" stopColor="#486f69" stopOpacity={0.28} />
                                    <stop offset="1" stopColor="#486f69" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="#ebe9e1" />
                            <XAxis
                                dataKey="day"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: '#8a8d87' }}
                            />
                            <YAxis
                                domain={[5, 9]}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: '#8a8d87' }}
                            />
                            <ChartTooltip
                                contentStyle={{
                                    borderRadius: 10,
                                    border: '1px solid #e3e0d7',
                                    fontSize: 12,
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="sleep"
                                stroke="#38645e"
                                strokeWidth={2.5}
                                fill="url(#sleep)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
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
                {events.slice(0, 5).map(event => {
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
                            <Badge variant="light" color="gray" fw={500}>
                                {event.source}
                            </Badge>
                            <IconChevronRight size={17} color="#a3a49e" />
                        </div>
                    )
                })}
            </section>
        </div>
    )
}
