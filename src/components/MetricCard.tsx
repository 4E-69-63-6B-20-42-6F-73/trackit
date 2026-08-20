import { Badge, Text } from '@mantine/core'
import { IconArrowUpRight } from '@tabler/icons-react'
import type { IconMoon } from '@tabler/icons-react'

export function MetricCard({
    icon: Icon,
    label,
    value,
    note,
    delta,
    tone,
}: {
    icon: typeof IconMoon
    label: string
    value: string
    note: string
    delta?: string
    tone: string
}) {
    return (
        <article className="metric-card">
            <div className={`metric-icon ${tone}`}>
                <Icon size={19} stroke={1.8} />
            </div>
            <div className="metric-top">
                <Text className="eyebrow">{label}</Text>
                {delta && (
                    <Badge
                        variant="light"
                        color="teal"
                        size="sm"
                        leftSection={<IconArrowUpRight size={11} />}
                    >
                        {delta}
                    </Badge>
                )}
            </div>
            <Text className="metric-value">{value}</Text>
            <Text className="metric-note">{note}</Text>
        </article>
    )
}
