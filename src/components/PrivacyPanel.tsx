import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { useEffect, useState } from 'react'
import {
    deleteCategory,
    deleteOwnerData,
    getDataCategorySummary,
    type DataCategorySummary,
} from '../lib/lifecycleApi'

const categories = {
    observations: {
        label: 'Health measurements',
        impact: 'Synced and manual measurements, derived metrics, and affected daily summaries',
    },
    meals: {
        label: 'Meals and nutrition',
        impact: 'Meal history and saved nutrient snapshots; foods and recipes remain available',
    },
    checkins: {
        label: 'Check-ins and notes',
        impact: 'The visible timeline entries linked to manual and synced records',
    },
} as const

export function PrivacyPanel() {
    const [category, setCategory] = useState<string | null>('observations')
    const [confirmation, setConfirmation] = useState('')
    const [message, setMessage] = useState('')
    const [pendingCategory, setPendingCategory] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [summary, setSummary] = useState<DataCategorySummary | null>(null)

    useEffect(() => {
        if (!category) return
        let active = true
        void getDataCategorySummary(category)
            .then(value => active && setSummary(value))
            .catch(() => active && setSummary(null))
        return () => {
            active = false
        }
    }, [category])

    const removeCategory = async () => {
        if (!pendingCategory) return
        setBusy(true)
        try {
            await deleteCategory(pendingCategory)
            setMessage(
                `${categories[pendingCategory as keyof typeof categories].label} were permanently deleted from the live database.`,
            )
            setPendingCategory(null)
        } catch {
            setMessage('The category could not be deleted. No success was recorded.')
        } finally {
            setBusy(false)
        }
    }

    const removeAll = async () => {
        setBusy(true)
        try {
            await deleteOwnerData(confirmation)
            window.location.reload()
        } catch {
            setMessage('All data could not be deleted. Check the phrase and try again.')
            setBusy(false)
        }
    }

    return (
        <Stack>
            <Text size="sm" c="dimmed">
                Review what TrackIt stores, export a portable copy, or deliberately delete selected
                data. TrackIt does not automatically remove records.
            </Text>
            <Select
                label="Category"
                value={category}
                onChange={setCategory}
                data={Object.entries(categories).map(([value, item]) => ({
                    value,
                    label: item.label,
                }))}
            />
            {category && (
                <Alert color="blue" title="What deletion affects">
                    {categories[category as keyof typeof categories].impact}.
                </Alert>
            )}
            {summary && (
                <div className="data-impact-summary">
                    <Text size="sm">
                        <strong>{summary.count.toLocaleString()}</strong> records
                    </Text>
                    <Text size="sm" c="dimmed">
                        Coverage:{' '}
                        {summary.oldest
                            ? new Date(summary.oldest).toLocaleDateString()
                            : 'No records'}
                        {summary.newest
                            ? ` to ${new Date(summary.newest).toLocaleDateString()}`
                            : ''}
                    </Text>
                </div>
            )}
            <Button color="red" variant="light" onClick={() => setPendingCategory(category)}>
                Delete{' '}
                {category
                    ? categories[category as keyof typeof categories].label.toLowerCase()
                    : 'category'}{' '}
                now
            </Button>
            <TextInput
                label="Delete installation data"
                description="Type DELETE ALL TRACKIT DATA"
                value={confirmation}
                onChange={event => setConfirmation(event.currentTarget.value)}
            />
            <Button
                color="red"
                loading={busy}
                disabled={confirmation !== 'DELETE ALL TRACKIT DATA'}
                onClick={() => void removeAll()}
            >
                Delete all owner data
            </Button>
            {message && <Alert>{message}</Alert>}
            <Modal
                opened={Boolean(pendingCategory)}
                onClose={() => setPendingCategory(null)}
                title={`Delete all ${pendingCategory ? categories[pendingCategory as keyof typeof categories].label.toLowerCase() : ''}?`}
                centered
            >
                <Stack>
                    <Alert color="red">
                        This permanently removes{' '}
                        {pendingCategory
                            ? categories[
                                  pendingCategory as keyof typeof categories
                              ].impact.toLowerCase()
                            : 'this category'}{' '}
                        from the live database.
                    </Alert>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setPendingCategory(null)}>
                            Cancel
                        </Button>
                        <Button color="red" loading={busy} onClick={() => void removeCategory()}>
                            Permanently delete
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    )
}
