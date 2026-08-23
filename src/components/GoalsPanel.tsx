import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Group,
    Skeleton,
    Menu,
    Modal,
    Progress,
    MultiSelect,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconDots, IconTargetArrow } from '@tabler/icons-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { metricCatalog, metricDefinition } from '../domain/metricCatalog'
import { createGoal, retireGoal, updateGoal, type GoalRecord } from '../lib/goalApi'
import { formatMetricValue } from '../domain/formatting'
import { listDailyMetrics, type DailyMetric } from '../lib/dailyMetricApi'
import { useServerData } from '../hooks/useServerData'

const metricDefaults: Record<string, number> = {
    steps: 10_000,
    exercise: 30,
    sleep: 8,
    heart_rate: 70,
    resting_heart_rate: 60,
    weight: 70,
    water: 2_000,
    energy: 7,
    calories: 2_000,
    protein: 100,
    carbs: 250,
    fat: 70,
    fiber: 30,
    sugar: 50,
    saturatedFat: 20,
    sodium: 2_300,
    potassium: 3_500,
}

const weekdays = [
    { value: '1', label: 'Monday' },
    { value: '2', label: 'Tuesday' },
    { value: '3', label: 'Wednesday' },
    { value: '4', label: 'Thursday' },
    { value: '5', label: 'Friday' },
    { value: '6', label: 'Saturday' },
    { value: '0', label: 'Sunday' },
]

const goalTemplates = [
    { label: 'Walk 8,000 steps', metric: 'steps', target: 8_000 },
    { label: 'Drink 2 L water', metric: 'water', target: 2_000 },
    { label: 'Sleep 8 hours', metric: 'sleep', target: 8 },
    { label: 'Check in with energy', metric: 'energy', target: 7 },
]

function GoalCard({
    goal,
    onRetire,
    metrics,
    onEdit,
}: {
    goal: GoalRecord
    onRetire: () => Promise<void>
    metrics: DailyMetric[]
    onEdit: () => void
}) {
    const definition = metricDefinition(goal.metric)
    const active = !goal.effectiveTo || new Date(goal.effectiveTo) > new Date()
    const matching = metrics.filter(item => item.metric === goal.metric)
    const today = new Date().toISOString().slice(0, 10)
    const current = matching.find(item => item.date === today)?.value ?? null
    const achieved = matching.filter(item => item.value >= goal.targetValue).length

    return (
        <article className="goal-card">
            <Group justify="space-between" align="start" wrap="nowrap">
                <div>
                    <Text fw={700}>{definition?.label ?? goal.metric}</Text>
                    <Text className="goal-target">
                        {goal.targetValue.toLocaleString()} {goal.canonicalUnit}
                    </Text>
                </div>
                <Group gap="xs">
                    <Badge color={active ? 'teal' : 'gray'} variant="light">
                        {active ? 'Active' : 'Past'}
                    </Badge>
                    {active && (
                        <Menu>
                            <Menu.Target>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray"
                                    aria-label={`Actions for ${definition?.label ?? goal.metric}`}
                                >
                                    <IconDots size={17} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Item onClick={onEdit}>Edit goal</Menu.Item>
                                <Menu.Item color="red" onClick={() => void onRetire()}>
                                    Retire goal today
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </Group>
            </Group>
            <Text size="sm" c="dimmed">
                From {new Date(goal.effectiveFrom).toLocaleDateString()}
                {goal.effectiveTo
                    ? ` to ${new Date(goal.effectiveTo).toLocaleDateString()}`
                    : ', with no end date'}
            </Text>
            <Text size="sm" c="dimmed">
                {goal.schedule.weekdays?.length
                    ? `${goal.schedule.weekdays.length} selected days each week`
                    : 'Every day'}
            </Text>
            {active && (
                <>
                    <Progress
                        value={
                            current === null ? 0 : Math.min(100, (current / goal.targetValue) * 100)
                        }
                        color="trackit"
                        aria-label="Goal progress"
                    />
                    <Text size="sm" fw={600}>
                        {current === null
                            ? 'No data recorded today'
                            : `${formatMetricValue(current, goal.canonicalUnit)} of ${formatMetricValue(goal.targetValue, goal.canonicalUnit)}`}
                    </Text>
                    <Text size="xs" c="dimmed">
                        {matching.length} of the last 30 days have data · goal met on {achieved}{' '}
                        {achieved === 1 ? 'day' : 'days'}
                    </Text>
                </>
            )}
        </article>
    )
}

export function GoalsPanel() {
    const { goals, loading } = useServerData()
    const [metric, setMetric] = useState<string | null>('steps')
    const [target, setTarget] = useState<number | string>(10_000)
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))
    const [effectiveTo, setEffectiveTo] = useState('')
    const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [metrics, setMetrics] = useState<DailyMetric[]>([])
    const [editing, setEditing] = useState<GoalRecord | null>(null)
    const [editTarget, setEditTarget] = useState<number | string>(0)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 29)
        void listDailyMetrics({
            from: from.toISOString().slice(0, 10),
            to: to.toISOString().slice(0, 10),
        })
            .then(setMetrics)
            .catch(() => undefined)
    }, [])
    const selectedDefinition = metricDefinition(metric)
    const activeGoals = useMemo(
        () => goals.filter(goal => !goal.effectiveTo || new Date(goal.effectiveTo) > new Date()),
        [goals],
    )
    const pastGoals = useMemo(
        () => goals.filter(goal => goal.effectiveTo && new Date(goal.effectiveTo) <= new Date()),
        [goals],
    )
    const invalidDateRange = Boolean(effectiveTo && effectiveTo < effectiveDate)
    const overlapping = activeGoals.some(
        goal =>
            goal.metric === metric &&
            (!effectiveTo ||
                !goal.effectiveTo ||
                goal.effectiveTo >= new Date(`${effectiveDate}T00:00:00`).toISOString()),
    )

    const save = async (event: FormEvent) => {
        event.preventDefault()
        if (!metric || !selectedDefinition || Number(target) <= 0) return
        setSaving(true)
        setMessage('')
        setError('')
        try {
            await createGoal({
                metric,
                targetValue: Number(target),
                canonicalUnit: selectedDefinition.unit,
                effectiveFrom: new Date(`${effectiveDate}T00:00:00`).toISOString(),
                effectiveTo: effectiveTo ? new Date(`${effectiveTo}T23:59:59`).toISOString() : null,
                schedule: { weekdays: selectedWeekdays.map(Number) },
            })
            setMessage(`${selectedDefinition.label} goal added.`)
        } catch {
            setError('The goal could not be saved. Check the values and try again.')
        } finally {
            setSaving(false)
        }
    }

    const retire = async (goal: GoalRecord) => {
        setError('')
        setMessage('')
        try {
            await retireGoal(goal)
            setMessage(`${metricDefinition(goal.metric)?.label ?? goal.metric} goal retired.`)
        } catch {
            setError('The goal could not be retired. Try again.')
        }
    }
    const saveEdit = async () => {
        if (!editing || Number(editTarget) <= 0) return
        setSaving(true)
        try {
            const saved = await updateGoal(editing.id, { targetValue: Number(editTarget) })
            window.dispatchEvent(new CustomEvent('trackit:goal-saved', { detail: saved }))
            setEditing(null)
            setMessage('Goal updated.')
        } catch {
            setError('The goal could not be updated. Try again.')
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
                        <h2 id="create-goal-title">Add a goal</h2>
                        <Text size="sm" c="dimmed">
                            Goals are optional and can start or end on a chosen date.
                        </Text>
                    </div>
                </div>
                <form onSubmit={event => void save(event)}>
                    <Stack>
                        <div>
                            <Text size="sm" fw={650} mb={6}>
                                Start with a common goal
                            </Text>
                            <Group gap="xs" className="goal-templates">
                                {goalTemplates.map(template => (
                                    <Button
                                        key={template.metric}
                                        type="button"
                                        size="compact-sm"
                                        variant={
                                            metric === template.metric &&
                                            Number(target) === template.target
                                                ? 'light'
                                                : 'default'
                                        }
                                        onClick={() => {
                                            setMetric(template.metric)
                                            setTarget(template.target)
                                        }}
                                    >
                                        {template.label}
                                    </Button>
                                ))}
                            </Group>
                        </div>
                        <Select
                            label="Metric"
                            value={metric}
                            onChange={value => {
                                setMetric(value)
                                if (value) setTarget(metricDefaults[value] ?? 1)
                            }}
                            data={metricCatalog.map(definition => ({
                                value: definition.value,
                                label: `${definition.label} (${definition.unit})`,
                            }))}
                            searchable
                        />
                        <NumberInput
                            label="Daily target"
                            value={target}
                            onChange={setTarget}
                            min={0.01}
                            suffix={selectedDefinition ? ` ${selectedDefinition.unit}` : undefined}
                            required
                        />
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <TextInput
                                type="date"
                                label="Starts"
                                value={effectiveDate}
                                onChange={event => setEffectiveDate(event.currentTarget.value)}
                                required
                            />
                            <TextInput
                                type="date"
                                label="Ends (optional)"
                                value={effectiveTo}
                                min={effectiveDate}
                                onChange={event => setEffectiveTo(event.currentTarget.value)}
                            />
                        </SimpleGrid>
                        <MultiSelect
                            label="Days of the week"
                            description="Leave empty for every day."
                            value={selectedWeekdays}
                            onChange={setSelectedWeekdays}
                            data={weekdays}
                            styles={{ description: { color: '#5b615b' } }}
                        />
                        {invalidDateRange && (
                            <Alert color="orange">
                                The end date must be on or after the start date.
                            </Alert>
                        )}
                        {overlapping && (
                            <Alert color="yellow">
                                An active {selectedDefinition?.label.toLowerCase()} goal overlaps
                                this period. Today uses the most recently effective matching goal.
                            </Alert>
                        )}
                        <Button
                            type="submit"
                            loading={saving}
                            disabled={!metric || Number(target) <= 0 || invalidDateRange}
                        >
                            Add goal
                        </Button>
                    </Stack>
                </form>
            </section>

            <section className="panel goal-list" aria-labelledby="your-goals-title">
                <Group justify="space-between" align="end">
                    <div>
                        <h2 id="your-goals-title">Your goals</h2>
                        <Text size="sm" c="dimmed">
                            Current targets first, with history kept for past records. When goals
                            overlap, Today uses the most recently effective matching goal.
                        </Text>
                    </div>
                    <Badge variant="outline" color="dark">
                        {activeGoals.length} active
                    </Badge>
                </Group>
                {message && (
                    <Alert color="teal" role="status">
                        {message}
                    </Alert>
                )}
                {error && <Alert color="orange">{error}</Alert>}
                {loading ? (
                    <Stack aria-label="Loading goals" role="status">
                        <Skeleton height={126} radius="md" />
                        <Skeleton height={126} radius="md" />
                    </Stack>
                ) : error ? null : goals.length === 0 ? (
                    <div className="goal-empty">
                        <IconTargetArrow size={28} />
                        <Text fw={700}>No goals yet</Text>
                        <Text size="sm" c="dimmed">
                            Add a target to see progress on Today. Your recorded data remains
                            unchanged.
                        </Text>
                    </div>
                ) : (
                    <Stack gap="sm">
                        {activeGoals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                metrics={metrics}
                                onEdit={() => {
                                    setEditing(goal)
                                    setEditTarget(goal.targetValue)
                                }}
                                onRetire={() => retire(goal)}
                            />
                        ))}
                        {pastGoals.length > 0 && (
                            <Text fw={700} mt="sm">
                                Goal history
                            </Text>
                        )}
                        {pastGoals.map(goal => (
                            <GoalCard
                                key={goal.id}
                                goal={goal}
                                metrics={metrics}
                                onEdit={() => {
                                    setEditing(goal)
                                    setEditTarget(goal.targetValue)
                                }}
                                onRetire={() => retire(goal)}
                            />
                        ))}
                    </Stack>
                )}
            </section>
            <Modal
                opened={Boolean(editing)}
                onClose={() => setEditing(null)}
                title={`Edit ${metricDefinition(editing?.metric ?? null)?.label ?? 'goal'}`}
                size="sm"
            >
                <Stack>
                    <NumberInput
                        label="Daily target"
                        min={0.01}
                        value={editTarget}
                        onChange={setEditTarget}
                        suffix={editing ? ` ${editing.canonicalUnit}` : undefined}
                    />
                    <Text size="sm" c="dimmed">
                        The existing schedule and effective dates remain unchanged.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setEditing(null)}>
                            Cancel
                        </Button>
                        <Button
                            loading={saving}
                            disabled={Number(editTarget) <= 0}
                            onClick={() => void saveEdit()}
                        >
                            Save changes
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </div>
    )
}
