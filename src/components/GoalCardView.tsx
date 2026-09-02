import { ActionIcon, Badge, Group, Menu, Progress, Text } from '@mantine/core'
import { IconDots, IconTrash } from '@tabler/icons-react'
import type { GoalCardPresentation } from './goalCardModel'

export type GoalCardViewProps = GoalCardPresentation & {
    retiring?: boolean
    onEdit: () => void
    onRetire: () => void
    onDelete: () => void
    onViewTrend: () => void
}

export function GoalCardView({
    definitionName,
    periodLabel,
    statusLabel,
    statusColor,
    valueLabel,
    targetLabel,
    timingLabel,
    detailLabel,
    progress,
    retired,
    retiring,
    onEdit,
    onRetire,
    onDelete,
    onViewTrend,
}: GoalCardViewProps) {
    return (
        <article className="goal-card">
            <Group justify="space-between" align="start" wrap="nowrap">
                <div>
                    <Text fw={700}>{definitionName}</Text>
                    <Text size="sm" c="dimmed">
                        {periodLabel}
                    </Text>
                </div>
                <Group gap="xs">
                    <Badge color={statusColor} variant="light">
                        {statusLabel}
                    </Badge>
                    <Menu>
                        <Menu.Target>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label={`Actions for ${definitionName}`}
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
                                        onClick={onRetire}
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
            <Text className="goal-target">{valueLabel}</Text>
            <Text size="sm">Target: {targetLabel}</Text>
            {timingLabel && (
                <Text size="xs" c="dimmed">
                    {timingLabel}
                </Text>
            )}
            <Text size="sm" c="dimmed">
                {detailLabel}
            </Text>
            {progress !== null && (
                <Progress value={progress * 100} color="trackit" aria-label="Goal progress" />
            )}
        </article>
    )
}
