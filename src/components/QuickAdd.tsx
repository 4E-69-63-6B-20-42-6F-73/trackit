import { useState } from 'react'
import {
    Button,
    Group,
    Modal,
    NumberInput,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import type { JournalEvent } from '../domain/types'

export function QuickAdd({
    opened,
    close,
    add,
}: {
    opened: boolean
    close: () => void
    add: (event: JournalEvent) => void
}) {
    const [kind, setKind] = useState('Meal')
    const [meal, setMeal] = useState('Lunch')
    const [description, setDescription] = useState('')
    const [amount, setAmount] = useState<number | string>(250)
    const [energy, setEnergy] = useState<string | null>('5 · Neutral')
    const [note, setNote] = useState('')
    const submit = () => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        let event: JournalEvent
        if (kind === 'Meal')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Meals',
                title: meal,
                detail: description || 'Meal logged',
                source: 'You',
            }
        else if (kind === 'Water')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Measurements',
                title: 'Water',
                detail: `${amount || 0} ml`,
                source: 'You',
            }
        else if (kind === 'Weight')
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Measurements',
                title: 'Weight',
                detail: `${amount || 0} kg`,
                source: 'You',
            }
        else
            event = {
                id: crypto.randomUUID(),
                time,
                category: 'Check-ins',
                title: 'Energy check-in',
                detail: `${energy?.split(' ')[0] || 5} out of 10${note ? ` · ${note}` : ''}`,
                source: 'You',
            }
        add(event)
        setDescription('')
        setNote('')
        close()
    }
    return (
        <Modal
            opened={opened}
            onClose={close}
            centered
            radius="lg"
            title={
                <div>
                    <Text fw={700} size="lg">
                        Quick add
                    </Text>
                    <Text size="sm" c="dimmed">
                        Add something to today
                    </Text>
                </div>
            }
        >
            <Stack gap="md">
                <SegmentedControl
                    fullWidth
                    value={kind}
                    onChange={setKind}
                    data={['Meal', 'Water', 'Weight', 'Check-in']}
                />
                {kind === 'Meal' && (
                    <>
                        <Select
                            label="Meal"
                            value={meal}
                            onChange={value => setMeal(value || 'Meal')}
                            data={['Breakfast', 'Lunch', 'Dinner', 'Snack']}
                        />
                        <TextInput
                            label="What did you have?"
                            value={description}
                            onChange={e => setDescription(e.currentTarget.value)}
                            placeholder="Search foods or describe a meal"
                            leftSection={<IconSearch size={16} />}
                        />
                    </>
                )}
                {kind === 'Water' && (
                    <NumberInput
                        label="Amount"
                        value={amount}
                        onChange={setAmount}
                        suffix=" ml"
                        step={50}
                        min={0}
                    />
                )}
                {kind === 'Weight' && (
                    <NumberInput
                        label="Weight"
                        value={amount}
                        onChange={setAmount}
                        decimalScale={1}
                        suffix=" kg"
                        placeholder="72.4"
                        min={0}
                    />
                )}
                {kind === 'Check-in' && (
                    <>
                        <Select
                            label="How is your energy?"
                            value={energy}
                            onChange={setEnergy}
                            data={[
                                '1 · Very low',
                                '2',
                                '3',
                                '4',
                                '5 · Neutral',
                                '6',
                                '7',
                                '8',
                                '9',
                                '10 · Excellent',
                            ]}
                        />
                        <TextInput
                            label="Note (optional)"
                            value={note}
                            onChange={e => setNote(e.currentTarget.value)}
                            placeholder="Anything worth remembering?"
                        />
                    </>
                )}
                <Group justify="flex-end">
                    <Button variant="subtle" color="gray" onClick={close}>
                        Cancel
                    </Button>
                    <Button color="teal" onClick={submit}>
                        Add to journal
                    </Button>
                </Group>
            </Stack>
        </Modal>
    )
}
