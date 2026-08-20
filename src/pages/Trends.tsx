import { SegmentedControl, Text } from '@mantine/core'
import { IconChevronRight, IconCircleCheck, IconTrendingUp } from '@tabler/icons-react'
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip as ChartTooltip,
    XAxis,
    YAxis,
} from 'recharts'
import { trend } from '../domain/data'

export function Trends() {
    return (
        <div className="page-content simple-page">
            <Text className="date">EXPLORE</Text>
            <h1>Trends</h1>
            <Text className="subhead">
                Look for patterns without losing sight of the underlying data.
            </Text>
            <section className="question-grid">
                {[
                    'How has my sleep changed?',
                    'Compare sleep and energy',
                    'What follows high-activity days?',
                ].map((x, i) => (
                    <button className="question" key={x}>
                        <div className={['indigo', 'violet', 'green'][i]}>
                            <IconTrendingUp size={20} />
                        </div>
                        <span>{x}</span>
                        <IconChevronRight size={17} />
                    </button>
                ))}
            </section>
            <section className="panel chart-large">
                <div className="panel-head">
                    <div>
                        <Text className="eyebrow">LAST 7 DAYS</Text>
                        <h2>Sleep & energy</h2>
                        <Text size="sm" c="dimmed">
                            Your energy tends to be higher after longer sleep.
                        </Text>
                    </div>
                    <SegmentedControl size="xs" data={['7D', '30D', '90D']} defaultValue="7D" />
                </div>
                <ResponsiveContainer width="100%" height={310}>
                    <AreaChart data={trend} margin={{ top: 25, right: 15, left: -10, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#ebe9e1" />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 10]} axisLine={false} tickLine={false} />
                        <ChartTooltip />
                        <Area
                            type="monotone"
                            dataKey="sleep"
                            stroke="#4f61a8"
                            fill="#4f61a81a"
                            strokeWidth={3}
                        />
                        <Area
                            type="monotone"
                            dataKey="energy"
                            stroke="#7c519c"
                            fill="#7c519c0f"
                            strokeWidth={3}
                        />
                    </AreaChart>
                </ResponsiveContainer>
                <div className="chart-note">
                    <IconCircleCheck size={18} />
                    <Text size="sm">
                        <strong>7 matched days.</strong> This is an observation, not proof that one
                        caused the other.
                    </Text>
                </div>
            </section>
        </div>
    )
}
