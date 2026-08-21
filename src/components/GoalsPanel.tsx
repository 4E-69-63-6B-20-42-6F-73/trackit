import {
    Alert,
    Badge,
    Button,
    Group,
    Loader,
    MultiSelect,
    NumberInput,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconTargetArrow } from '@tabler/icons-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { metricCatalog, metricDefinition } from '../domain/metricCatalog'
import { createGoal, listGoals, retireGoal, type GoalRecord } from '../lib/goalApi'

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

function GoalCard({ goal, onRetire }: { goal: GoalRecord; onRetire: () => Promise<void> }) {
    const definition = metricDefinition(goal.metric)
    const active = !goal.effectiveTo || new Date(goal.effectiveTo) > new Date()

    return (
        <article className="goal-card">
            <Group justify="space-between" align="start" wrap="nowrap">
                <div>
                    <Text fw={700}>{definition?.label ?? goal.metric}</Text>
                    <Text className="goal-target">
                        {goal.targetValue.toLocaleString()} {goal.canonicalUnit}
                    </Text>
                </div>
                <Badge color={active ? 'teal' : 'gray'} variant="light">
                    {active ? 'Active' : 'Past'}
                </Badge>
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
                <Button size="xs" variant="default" onClick={() => void onRetire()}>
                    Retire goal today
                </Button>
            )}
        </article>
    )
}

export function GoalsPanel() {
    const [goals, setGoals] = useState<GoalRecord[]>([])
    const [metric, setMetric] = useState<string | null>('steps')
    const [target, setTarget] = useState<number | string>(10_000)
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))
    const [effectiveTo, setEffectiveTo] = useState('')
    const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        void listGoals()
            .then(setGoals)
            .catch(() => setError('Goals are unavailable. Check the server connection and retry.'))
            .finally(() => setLoading(false))
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
    const selectedMetricAlreadyActive = activeGoals.some(goal => goal.metric === metric)
    const invalidDateRange = Boolean(effectiveTo && effectiveTo < effectiveDate)

    const save = async (event: FormEvent) => {
        event.preventDefault()
        if (!metric || !selectedDefinition || Number(target) <= 0) return
        setSaving(true)
        setMessage('')
        setError('')
        try {
            const goal = await createGoal({
                metric,
                targetValue: Number(target),
                canonicalUnit: selectedDefinition.unit,
                effectiveFrom: new Date(`${effectiveDate}T00:00:00`).toISOString(),
                effectiveTo: effectiveTo ? new Date(`${effectiveTo}T23:59:59`).toISOString() : null,
                schedule: { weekdays: selectedWeekdays.map(Number) },
            })
            setGoals(current => [goal, ...current])
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
            const retired = await retireGoal(goal)
            setGoals(current => current.map(item => (item.id === retired.id ? retired : item)))
            setMessage(`${metricDefinition(goal.metric)?.label ?? goal.metric} goal retired.`)
        } catch {
            setError('The goal could not be retired. Try again.')
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
                        {selectedMetricAlreadyActive && (
                            <Alert color="orange">
                                An active {selectedDefinition?.label.toLowerCase()} goal already
                                exists. Retire it before adding a replacement so progress stays
                                unambiguous.
                            </Alert>
                        )}
                        {invalidDateRange && (
                            <Alert color="orange">
                                The end date must be on or after the start date.
                            </Alert>
                        )}
                        <Button
                            type="submit"
                            loading={saving}
                            disabled={
                                !metric ||
                                Number(target) <= 0 ||
                                selectedMetricAlreadyActive ||
                                invalidDateRange
                            }
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
                            Current targets first, with history kept for past records.
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
                    <Loader role="status" aria-label="Loading goals" />
                ) : goals.length === 0 ? (
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
                            <GoalCard key={goal.id} goal={goal} onRetire={() => retire(goal)} />
                        ))}
                        {pastGoals.length > 0 && (
                            <Text fw={700} mt="sm">
                                Goal history
                            </Text>
                        )}
                        {pastGoals.map(goal => (
                            <GoalCard key={goal.id} goal={goal} onRetire={() => retire(goal)} />
                        ))}
                    </Stack>
                )}
            </section>
        </div>
    )
}
