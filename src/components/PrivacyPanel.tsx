import {
    Alert,
    Button,
    Group,
    Modal,
    Paper,
    SegmentedControl,
    Select,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
} from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import {
    deleteOwnerData,
    rebuildProjections,
    rederiveObservations,
    type MaintenanceDateRange,
    type MaintenanceRederiveRequest,
} from '../lib/dataApi'
import { downloadExport } from '../lib/exportApi'

type RangeMode = '30d' | 'all' | 'custom'
type RecordCategory = 'all' | 'sleep' | 'heart' | 'activity' | 'measurements'

const recordCategories: Record<RecordCategory, { label: string; recordTypes?: string[] }> = {
    all: { label: 'All imported data' },
    sleep: { label: 'Sleep', recordTypes: ['SleepSessionRecord'] },
    heart: {
        label: 'Heart & cardiovascular',
        recordTypes: [
            'HeartRateRecord',
            'RestingHeartRateRecord',
            'BloodPressureRecord',
            'HeartRateVariabilityRmssdRecord',
            'OxygenSaturationRecord',
            'RespiratoryRateRecord',
        ],
    },
    activity: {
        label: 'Activity',
        recordTypes: [
            'StepsRecord',
            'ExerciseSessionRecord',
            'DistanceRecord',
            'ActiveCaloriesBurnedRecord',
            'TotalCaloriesBurnedRecord',
            'Vo2MaxRecord',
        ],
    },
    measurements: {
        label: 'Body measurements',
        recordTypes: [
            'WeightRecord',
            'BodyFatRecord',
            'HeightRecord',
            'LeanBodyMassRecord',
            'BasalMetabolicRateRecord',
            'HydrationRecord',
        ],
    },
}

const localDateKey = (date: Date) => {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function PrivacyPanel() {
    const [confirmation, setConfirmation] = useState('')
    const [rangeMode, setRangeMode] = useState<RangeMode>('30d')
    const [customFrom, setCustomFrom] = useState('')
    const [customTo, setCustomTo] = useState(localDateKey(new Date()))
    const [recordCategory, setRecordCategory] = useState<RecordCategory>('all')
    const [confirmRederive, setConfirmRederive] = useState(false)

    const exportMutation = useMutation({
        mutationFn: (format: 'json' | 'csv') => downloadExport(format),
    })
    const rebuildMutation = useMutation({
        mutationFn: ({ range }: { range: MaintenanceDateRange; label: string }) =>
            rebuildProjections(range),
    })
    const rederiveMutation = useMutation({
        mutationFn: ({ input }: { input: MaintenanceRederiveRequest; scopeLabel: string }) =>
            rederiveObservations(input),
    })
    const deleteMutation = useMutation({
        mutationFn: (phrase: string) => deleteOwnerData(phrase),
        onSuccess: () => window.location.reload(),
    })

    const resetFeedback = () => {
        exportMutation.reset()
        rebuildMutation.reset()
        rederiveMutation.reset()
        deleteMutation.reset()
    }

    const maintenanceRange = (): MaintenanceDateRange => {
        if (rangeMode === 'all') return {}
        if (rangeMode === '30d') return { lastDays: 30 }
        return { from: customFrom || undefined, to: customTo || undefined }
    }

    const maintenanceRederiveRequest = (): MaintenanceRederiveRequest => ({
        ...maintenanceRange(),
        ...(recordCategories[recordCategory].recordTypes
            ? { recordTypes: recordCategories[recordCategory].recordTypes }
            : {}),
    })

    const rangeValid =
        rangeMode !== 'custom' ||
        (Boolean(customFrom) && Boolean(customTo) && customFrom <= customTo)

    const rangeLabel = () => {
        if (rangeMode === 'all') return 'all retained history'
        if (rangeMode === '30d') return 'the last 30 days'
        return customFrom && customTo ? `${customFrom} through ${customTo}` : 'the selected range'
    }

    const rederiveScopeLabel = () =>
        recordCategory === 'all'
            ? rangeLabel()
            : `${recordCategories[recordCategory].label.toLowerCase()} in ${rangeLabel()}`

    const exportData = (format: 'json' | 'csv') => {
        resetFeedback()
        exportMutation.mutate(format)
    }

    const rebuild = () => {
        resetFeedback()
        rebuildMutation.mutate({ range: maintenanceRange(), label: rangeLabel() })
    }

    const rederive = () => {
        setConfirmRederive(false)
        resetFeedback()
        rederiveMutation.mutate({
            input: maintenanceRederiveRequest(),
            scopeLabel: rederiveScopeLabel(),
        })
    }

    const removeAll = () => {
        resetFeedback()
        deleteMutation.mutate(confirmation)
    }

    const maintenanceBusy = rebuildMutation.isPending || rederiveMutation.isPending
    const message = rebuildMutation.isSuccess
        ? rebuildMutation.data.queuedDates
            ? `Projection rebuild queued for ${rebuildMutation.data.queuedDates} day${rebuildMutation.data.queuedDates === 1 ? '' : 's'} in ${rebuildMutation.variables.label}.`
            : `There are no projection dates to rebuild in ${rebuildMutation.variables.label}.`
        : rebuildMutation.isError
          ? rebuildMutation.error instanceof Error
              ? `Projection rebuild could not be queued: ${rebuildMutation.error.message}`
              : 'The projection rebuild could not be queued. Try again.'
          : rederiveMutation.isSuccess
            ? rederiveMutation.data.sourceRecords
                ? `Re-derived ${rederiveMutation.data.canonicalObservations} canonical observation${rederiveMutation.data.canonicalObservations === 1 ? '' : 's'} from ${rederiveMutation.data.sourceRecords} provider record${rederiveMutation.data.sourceRecords === 1 ? '' : 's'} for ${rederiveMutation.variables.scopeLabel}. ${rederiveMutation.data.queuedProjectionDates} affected projection day${rederiveMutation.data.queuedProjectionDates === 1 ? '' : 's'} queued for refresh.`
                : `There are no retained provider records to re-derive for ${rederiveMutation.variables.scopeLabel}.`
            : rederiveMutation.isError
              ? rederiveMutation.error instanceof Error
                  ? `Imported observations could not be re-derived: ${rederiveMutation.error.message}`
                  : 'Imported observations could not be re-derived. Try again.'
              : exportMutation.isError
                ? 'The export could not be downloaded. Try again.'
                : deleteMutation.isError
                  ? 'All data could not be deleted. Check the phrase and try again.'
                  : ''
    const messageColor =
        rebuildMutation.isSuccess || rederiveMutation.isSuccess ? 'green' : 'orange'

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
                        loading={exportMutation.isPending && exportMutation.variables === 'json'}
                        onClick={() => exportData('json')}
                    >
                        Export JSON
                    </Button>
                    <Button
                        variant="default"
                        loading={exportMutation.isPending && exportMutation.variables === 'csv'}
                        onClick={() => exportData('csv')}
                    >
                        Export CSV
                    </Button>
                </Group>
            </section>

            <section>
                <Text fw={700}>Data maintenance</Text>
                <Text size="sm" c="dimmed" mb="md">
                    Repair derived data without deleting retained source data. Choose the calendar
                    range once, then run the maintenance operation you need. Dates are interpreted
                    in your TrackIt profile timezone.
                </Text>

                <Stack gap="md">
                    <SegmentedControl
                        fullWidth
                        value={rangeMode}
                        onChange={value => setRangeMode(value as RangeMode)}
                        data={[
                            { label: 'Last 30 days', value: '30d' },
                            { label: 'All history', value: 'all' },
                            { label: 'Custom', value: 'custom' },
                        ]}
                    />

                    {rangeMode === 'custom' && (
                        <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            <TextInput
                                type="date"
                                label="From"
                                value={customFrom}
                                max={customTo || localDateKey(new Date())}
                                onChange={event => setCustomFrom(event.currentTarget.value)}
                                error={
                                    customFrom && customTo && customFrom > customTo
                                        ? 'Must be on or before Through'
                                        : undefined
                                }
                            />
                            <TextInput
                                type="date"
                                label="Through"
                                value={customTo}
                                min={customFrom || undefined}
                                max={localDateKey(new Date())}
                                onChange={event => setCustomTo(event.currentTarget.value)}
                            />
                        </SimpleGrid>
                    )}

                    <Paper withBorder p="md" radius="md">
                        <Text fw={600}>Rebuild projections</Text>
                        <Text size="sm" c="dimmed" mt={4} mb="md">
                            Recompute derived daily read models from the canonical observations
                            already stored in TrackIt. Observations and provider records are not
                            changed.
                        </Text>
                        <Button
                            variant="default"
                            loading={rebuildMutation.isPending}
                            disabled={!rangeValid || maintenanceBusy}
                            onClick={rebuild}
                        >
                            Rebuild projections
                        </Button>
                    </Paper>

                    <Paper withBorder p="md" radius="md">
                        <Text fw={600}>Re-derive imported observations</Text>
                        <Text size="sm" c="dimmed" mt={4} mb="xs">
                            Recreate connector-derived canonical observations from retained provider
                            records using TrackIt’s current derivation rules. Manual observations
                            are not touched.
                        </Text>
                        <Text size="xs" c="dimmed" mb="md">
                            This can change Journal, Today, Trends, and goal results for the
                            selected range. Affected projections are queued for rebuild
                            automatically.
                        </Text>
                        <Select
                            label="Imported data category"
                            description="Limit re-derivation to reduce memory use for high-volume data."
                            styles={{ description: { color: 'var(--mantine-color-text)' } }}
                            value={recordCategory}
                            onChange={value =>
                                setRecordCategory((value ?? 'all') as RecordCategory)
                            }
                            data={Object.entries(recordCategories).map(([value, category]) => ({
                                value,
                                label: category.label,
                            }))}
                            mb="md"
                        />
                        <Button
                            variant="default"
                            loading={rederiveMutation.isPending}
                            disabled={!rangeValid || maintenanceBusy}
                            onClick={() => setConfirmRederive(true)}
                        >
                            Re-derive imported observations
                        </Button>
                    </Paper>
                </Stack>
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
                    loading={deleteMutation.isPending}
                    disabled={confirmation !== 'DELETE ALL TRACKIT DATA'}
                    onClick={removeAll}
                >
                    Delete all TrackIt data
                </Button>
            </section>

            {message && <Alert color={messageColor}>{message}</Alert>}

            <Modal
                opened={confirmRederive}
                onClose={() => setConfirmRederive(false)}
                title="Re-derive imported observations?"
                centered
            >
                <Stack gap="md">
                    <Text size="sm">
                        TrackIt will replace connector-derived canonical observations backed by
                        retained provider records for {rederiveScopeLabel()} using the current
                        derivation rules.
                    </Text>
                    <Text size="sm" c="dimmed">
                        Provider records and manual observations remain unchanged. Any affected
                        daily projections will be rebuilt afterward.
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setConfirmRederive(false)}>
                            Cancel
                        </Button>
                        <Button
                            color="orange"
                            loading={rederiveMutation.isPending}
                            onClick={rederive}
                        >
                            Re-derive observations
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    )
}
