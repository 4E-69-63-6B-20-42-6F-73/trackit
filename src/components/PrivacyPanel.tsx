import {
    Alert,
    Button,
    Group,
    Modal,
    NumberInput,
    Select,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import {
    deleteCategory,
    deleteOwnerData,
    getDataCategorySummary,
    setRetention,
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
    journal: {
        label: 'Journal entries',
        impact: 'The visible timeline entries linked to manual and synced records',
    },
} as const

export function PrivacyPanel() {
    const [category, setCategory] = useState<string | null>('observations')
    const [days, setDays] = useState<number | string>(365)
    const [enabled, setEnabled] = useState(false)
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

    const save = async () => {
        if (!category) return
        setBusy(true)
        try {
            await setRetention(category, Number(days), enabled)
            setMessage(
                'Retention rule saved. It applies to live data; backup retention is managed separately.',
            )
        } catch {
            setMessage('The retention rule could not be saved. Try again.')
        } finally {
            setBusy(false)
        }
    }

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
                Retention removes records from the live database. Rotate old backup archives on the
                same schedule so deleted data cannot be restored later.
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
                <Alert color="blue" title="What this rule affects">
                    {categories[category as keyof typeof categories].impact}. Changes do not restore
                    records already removed. TrackIt-managed backups are purged for immediate
                    deletion.
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
                    <Text size="sm" c="dimmed">
                        Last retention run:{' '}
                        {summary.lastRetentionRun
                            ? new Date(summary.lastRetentionRun).toLocaleString()
                            : 'Never recorded'}{' '}
                        · next run follows the server schedule
                    </Text>
                </div>
            )}
            <NumberInput label="Keep for" suffix=" days" min={1} value={days} onChange={setDays} />
            <Switch
                label="Enable automatic retention"
                checked={enabled}
                onChange={event => setEnabled(event.currentTarget.checked)}
            />
            <Button loading={busy} onClick={() => void save()}>
                Save retention rule
            </Button>
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
                        from the live database and purges TrackIt-managed backup archives.
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
