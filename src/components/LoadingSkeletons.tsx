import { Group, SimpleGrid, Skeleton, Stack } from '@mantine/core'

function JournalRows() {
    return (
        <Stack gap={0}>
            {[0, 1, 2, 3].map(index => (
                <div
                    key={index}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '50px 38px minmax(0, 1fr) 20px',
                        gap: 10,
                        alignItems: 'center',
                        minHeight: 78,
                        borderTop: '1px solid var(--line)',
                    }}
                >
                    <Skeleton height={12} width={38} />
                    <Skeleton height={34} width={34} radius={10} />
                    <Stack gap={7}>
                        <Skeleton height={14} width={index % 2 ? '46%' : '36%'} />
                        <Skeleton height={11} width={index % 2 ? '68%' : '58%'} />
                    </Stack>
                    <Skeleton height={18} width={18} radius="xl" />
                </div>
            ))}
        </Stack>
    )
}

export function JournalPageSkeleton() {
    return (
        <div className="page-content journal-page" role="status" aria-label="Loading journal">
            <Stack gap={7} mb={26}>
                <Skeleton height={34} width={150} radius="sm" />
                <Skeleton height={14} width="55%" maw={520} />
            </Stack>
            <Group justify="flex-end" gap="sm" mb={24}>
                <Skeleton height={36} width={260} radius="sm" />
                <Skeleton height={36} width={92} radius="sm" />
            </Group>
            <section className="panel timeline journal-timeline">
                <Skeleton height={13} width={64} mb={15} />
                <JournalRows />
            </section>
        </div>
    )
}

function GoalCardSkeleton() {
    return (
        <article className="goal-card">
            <Group justify="space-between" align="start" wrap="nowrap">
                <Stack gap={7} style={{ flex: 1 }}>
                    <Skeleton height={15} width="34%" />
                    <Skeleton height={11} width="42%" />
                </Stack>
                <Skeleton height={22} width={76} radius="xl" />
            </Group>
            <Skeleton height={28} width="28%" mt="md" />
            <Skeleton height={12} width="58%" mt="sm" />
            <Skeleton height={11} width="45%" />
            <Skeleton height={8} radius="xl" mt="xs" />
        </article>
    )
}

export function GoalsPageSkeleton() {
    return (
        <div className="page-content goals-page" role="status" aria-label="Loading goals page">
            <Stack gap={7} mb={26}>
                <Skeleton height={34} width={126} radius="sm" />
                <Skeleton height={14} width="52%" maw={520} />
            </Stack>
            <div className="goals-layout has-goals">
                <section className="panel goal-create">
                    <Group align="start" mb="lg">
                        <Skeleton height={28} width={28} radius="md" />
                        <Stack gap={7} style={{ flex: 1 }}>
                            <Skeleton height={20} width={116} />
                            <Skeleton height={12} width="76%" />
                        </Stack>
                    </Group>
                    <Stack gap="md">
                        {[0, 1, 2, 3].map(index => (
                            <Stack gap={6} key={index}>
                                <Skeleton height={11} width={index === 0 ? 145 : 86} />
                                <Skeleton height={36} radius="sm" />
                            </Stack>
                        ))}
                        <Group justify="flex-end">
                            <Skeleton height={36} width={106} radius="sm" />
                        </Group>
                    </Stack>
                </section>
                <section className="panel goal-list">
                    <Skeleton height={21} width={112} mb={8} />
                    <Skeleton height={12} width="72%" mb="md" />
                    <Stack gap="sm">
                        <GoalCardSkeleton />
                        <GoalCardSkeleton />
                    </Stack>
                </section>
            </div>
        </div>
    )
}

export function TodayGoalsSkeleton() {
    return (
        <Stack gap={0} role="status" aria-label="Loading daily goals">
            {[0, 1, 2].map(index => (
                <div className="today-goal-row" key={index}>
                    <Stack gap={6} className="today-goal-copy">
                        <Skeleton height={13} width={index === 1 ? 92 : 118} />
                        <Skeleton height={10} width={index === 1 ? 148 : 176} />
                    </Stack>
                    <Skeleton className="today-goal-progress" height={8} width="38%" radius="xl" />
                </div>
            ))}
        </Stack>
    )
}

export function NutritionSkeleton() {
    return (
        <Stack gap="md" role="status" aria-label="Loading daily nutrition">
            <Group justify="space-between" align="flex-start">
                <Stack gap={7}>
                    <Skeleton height={10} width={52} />
                    <Skeleton height={24} width={108} />
                </Stack>
                <Skeleton height={12} width={96} />
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                {[0, 1, 2, 3].map(index => (
                    <Stack gap={6} key={index}>
                        <Skeleton height={9} width={index === 0 ? 54 : 42} />
                        <Skeleton height={14} width={62} />
                    </Stack>
                ))}
            </SimpleGrid>
            <Stack gap={7}>
                <Group justify="space-between">
                    <Skeleton height={9} width={78} />
                    <Skeleton height={9} width={72} />
                </Group>
                <Skeleton height={8} radius="xl" />
            </Stack>
        </Stack>
    )
}
