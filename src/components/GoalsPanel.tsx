import {
    Alert,
    Button,
    Group,
    MultiSelect,
    NumberInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import { createGoal, listGoals, type GoalRecord } from '../lib/goalApi'

const metricUnits: Record<string, string> = {
    steps: 'count',
    water: 'ml',
    protein: 'g',
    sleep: 'hours',
}

export function GoalsPanel() {
    const [goals, setGoals] = useState<GoalRecord[]>([])
    const [metric, setMetric] = useState<string | null>('steps')
    const [target, setTarget] = useState<number | string>(10000)
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10))
    const [effectiveTo, setEffectiveTo] = useState('')
    const [weekdays, setWeekdays] = useState<string[]>([])
    const [error, setError] = useState('')

    useEffect(() => {
        void listGoals()
            .then(setGoals)
            .catch(() => setError('Goals are unavailable.'))
    }, [])

    const save = async () => {
        if (!metric) return
        try {
            const goal = await createGoal({
                metric,
                targetValue: Number(target),
                canonicalUnit: metricUnits[metric],
                effectiveFrom: new Date(`${effectiveDate}T00:00:00`).toISOString(),
                effectiveTo: effectiveTo ? new Date(`${effectiveTo}T23:59:59`).toISOString() : null,
                schedule: { weekdays: weekdays.map(Number) },
            })
            setGoals(current => [goal, ...current])
            setError('')
        } catch {
            setError('The goal could not be saved.')
        }
    }

    return (
        <Stack>
            <Text size="sm" c="dimmed">
                New goals start on their effective date. Earlier records keep their historical goal
                context.
            </Text>
            <Select
                label="Metric"
                value={metric}
                onChange={setMetric}
                data={Object.keys(metricUnits)}
            />
            <NumberInput label="Target" value={target} onChange={setTarget} min={0.01} />
            <TextInput
                type="date"
                label="Effective from"
                value={effectiveDate}
                onChange={event => setEffectiveDate(event.currentTarget.value)}
            />
            <TextInput
                type="date"
                label="Effective until (optional)"
                value={effectiveTo}
                min={effectiveDate}
                onChange={event => setEffectiveTo(event.currentTarget.value)}
            />
            <MultiSelect
                label="Active weekdays (optional)"
                description="Leave empty to apply every day."
                value={weekdays}
                onChange={setWeekdays}
                data={[
                    { value: '1', label: 'Monday' },
                    { value: '2', label: 'Tuesday' },
                    { value: '3', label: 'Wednesday' },
                    { value: '4', label: 'Thursday' },
                    { value: '5', label: 'Friday' },
                    { value: '6', label: 'Saturday' },
                    { value: '0', label: 'Sunday' },
                ]}
            />
            {error && <Alert color="orange">{error}</Alert>}
            <Button onClick={() => void save()}>Add goal version</Button>
            {goals.map(goal => (
                <Group key={goal.id} justify="space-between">
                    <Text size="sm" fw={600}>
                        {goal.metric}
                    </Text>
                    <Text size="sm">
                        {goal.targetValue} {goal.canonicalUnit} from{' '}
                        {new Date(goal.effectiveFrom).toLocaleDateString()}
                        {goal.effectiveTo
                            ? ` until ${new Date(goal.effectiveTo).toLocaleDateString()}`
                            : ''}
                        {goal.schedule.weekdays?.length
                            ? ` · ${goal.schedule.weekdays.length} scheduled days/week`
                            : ' · every day'}
                    </Text>
                </Group>
            ))}
        </Stack>
    )
}
