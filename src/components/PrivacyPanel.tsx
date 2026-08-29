import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core'
import { useState } from 'react'
import { deleteOwnerData } from '../lib/dataApi'
import { downloadExport } from '../lib/exportApi'

export function PrivacyPanel() {
    const [confirmation, setConfirmation] = useState('')
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)
    const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)

    const exportData = async (format: 'json' | 'csv') => {
        setExporting(format)
        setMessage('')
        try {
            await downloadExport(format)
        } catch {
            setMessage('The export could not be downloaded. Try again.')
        } finally {
            setExporting(null)
        }
    }

    const removeAll = async () => {
        setBusy(true)
        setMessage('')
        try {
            await deleteOwnerData(confirmation)
            window.location.reload()
        } catch {
            setMessage('All data could not be deleted. Check the phrase and try again.')
            setBusy(false)
        }
    }

    return (
        <Stack gap="xl">
            <section>
                <Text fw={700}>Export</Text>
                <Text size="sm" c="dimmed" mb="md">
                    Download a portable copy of your observations, projections, goals, foods,
                    recipes, sources, and relevant configuration. Export does not change live data.
                </Text>
                <Group>
                    <Button
                        variant="default"
                        loading={exporting === 'json'}
                        onClick={() => void exportData('json')}
                    >
                        Export JSON
                    </Button>
                    <Button
                        variant="default"
                        loading={exporting === 'csv'}
                        onClick={() => void exportData('csv')}
                    >
                        Export CSV
                    </Button>
                </Group>
            </section>

            <section>
                <Text fw={700}>Delete TrackIt data</Text>
                <Text size="sm" c="dimmed" mb="md">
                    Permanently delete your observations, projections, reference data, integrations,
                    authentication state, and other owner data from the live TrackIt database.
                    Infrastructure snapshots created outside TrackIt are controlled by the operator.
                </Text>
                <TextInput
                    label="Confirmation"
                    description="Type DELETE ALL TRACKIT DATA"
                    styles={{ description: { color: 'var(--muted)' } }}
                    value={confirmation}
                    onChange={event => setConfirmation(event.currentTarget.value)}
                />
                <Button
                    mt="md"
                    color="red"
                    loading={busy}
                    disabled={confirmation !== 'DELETE ALL TRACKIT DATA'}
                    onClick={() => void removeAll()}
                >
                    Delete all TrackIt data
                </Button>
            </section>

            {message && <Alert color="orange">{message}</Alert>}
        </Stack>
    )
}
