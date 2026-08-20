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
import { useState } from 'react'
import { deleteCategory, deleteOwnerData, setRetention } from '../lib/lifecycleApi'

export function PrivacyPanel() {
    const [category, setCategory] = useState<string | null>('observations')
    const [days, setDays] = useState<number | string>(365)
    const [enabled, setEnabled] = useState(false)
    const [confirmation, setConfirmation] = useState('')
    const [message, setMessage] = useState('')
    const [pendingCategory, setPendingCategory] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

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
            setMessage(`${pendingCategory} were permanently deleted from the live database.`)
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
                data={['observations', 'meals', 'journal']}
            />
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
                Delete this category now
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
                title={`Delete all ${pendingCategory ?? ''}?`}
                centered
            >
                <Stack>
                    <Alert color="red">
                        This permanently removes the category from the live database and purges
                        TrackIt-managed backup archives.
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
