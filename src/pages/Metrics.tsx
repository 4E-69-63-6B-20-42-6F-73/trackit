import { Alert, Button, Group, Modal, Radio, SegmentedControl, Stack, Text } from '@mantine/core'
import { useMemo, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { MetricRow } from '../components/MetricRow'
import { metricCatalog, type MetricDefinition } from '../domain/metricCatalog'
import {
    detectUnitPreset,
    normalizedMetricPreferences,
    preferencesForPreset,
    formatMetricDisplayValue,
    unitPresentation,
    type UnitPreset,
} from '../domain/metrics'
import { useServerData } from '../hooks/useServerData'
import { updatePreferences } from '../lib/preferencesApi'

export function Metrics() {
    const { preferences, loading } = useServerData()
    const [editing, setEditing] = useState<MetricDefinition | null>(null)
    const [draftUnit, setDraftUnit] = useState('')
    const [draftPrecision, setDraftPrecision] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const selected = normalizedMetricPreferences(preferences?.metricPreferences, preferences?.units)
    const preset = detectUnitPreset(selected)
    const categories = useMemo(() => [...new Set(metricCatalog.map(metric => metric.category))], [])
    const save = async (
        metricPreferences: typeof selected,
        units = preferences?.units ?? 'metric',
    ) => {
        if (!preferences) return
        setSaving(true)
        setMessage('')
        try {
            await updatePreferences({ metricPreferences, units })
            setEditing(null)
        } catch {
            setMessage('Your unit preference could not be saved. Try again.')
        } finally {
            setSaving(false)
        }
    }
    const applyPreset = (next: string) => {
        if (next === 'custom' || !preferences) return
        void save(
            preferencesForPreset(next as Exclude<UnitPreset, 'custom'>),
            next as 'metric' | 'imperial',
        )
    }
    const openMetric = (metric: MetricDefinition) => {
        setEditing(metric)
        setDraftUnit(selected[metric.id].displayUnit)
        setDraftPrecision(selected[metric.id].precision ?? metric.precision)
    }
    return (
        <div className="page-content metrics-page">
            <PageHeader
                title="Metrics"
                description="Choose how measurements are shown throughout TrackIt."
            />
            <section className="panel metrics-units" aria-labelledby="unit-system-heading">
                <Text id="unit-system-heading" fw={700}>
                    Units
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                    Choose a preset or customize individual metrics.
                </Text>
                <SegmentedControl
                    aria-label="Unit preset"
                    value={preset}
                    onChange={applyPreset}
                    disabled={loading || saving}
                    data={[
                        { label: 'Metric', value: 'metric' },
                        { label: 'Imperial', value: 'imperial' },
                        { label: 'Custom', value: 'custom' },
                    ]}
                />
            </section>
            {message && (
                <Alert mt="md" color="orange">
                    {message}
                </Alert>
            )}
            {categories.map(category => (
                <section
                    className="metric-category"
                    key={category}
                    aria-labelledby={`metric-${category}`}
                >
                    <Text id={`metric-${category}`} fw={700} mb="sm">
                        {category}
                    </Text>
                    <div className="metric-row-list">
                        {metricCatalog
                            .filter(metric => metric.category === category)
                            .map(metric => {
                                const configurable =
                                    metric.displayUnits.length > 1 || metric.precision > 0
                                return (
                                    <MetricRow
                                        key={metric.id}
                                        metric={metric}
                                        displayUnit={selected[metric.id].displayUnit}
                                        clickable={configurable && !saving}
                                        onClick={() => openMetric(metric)}
                                    />
                                )
                            })}
                    </div>
                </section>
            ))}
            <Modal opened={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.name}>
                {editing && (
                    <Radio.Group label="Display unit" value={draftUnit} onChange={setDraftUnit}>
                        <Stack mt="sm">
                            {editing.displayUnits.map(unit => (
                                <Radio
                                    key={unit}
                                    value={unit}
                                    label={`${unitPresentation(unit).name} (${unitPresentation(unit).label})`}
                                    disabled={saving}
                                />
                            ))}
                        </Stack>
                    </Radio.Group>
                )}
                {editing && editing.precision > 0 && (
                    <Radio.Group
                        label="Decimal places"
                        description="Controls display only. Stored values are not changed."
                        value={String(draftPrecision ?? editing.precision)}
                        onChange={value => value !== null && setDraftPrecision(Number(value))}
                    >
                        <Stack mt="sm">
                            {[0, 1, 2].map(precision => (
                                <Radio
                                    key={precision}
                                    value={String(precision)}
                                    label={`${precision} — ${formatMetricDisplayValue(
                                        editing.id,
                                        80,
                                        draftUnit,
                                        {
                                            ...selected,
                                            [editing.id]: {
                                                displayUnit: draftUnit,
                                                precision,
                                            },
                                        },
                                        preferences?.locale,
                                    )}`}
                                />
                            ))}
                        </Stack>
                    </Radio.Group>
                )}
                {editing && (
                    <Group justify="flex-end" mt="xl">
                        <Button variant="default" onClick={() => setEditing(null)}>
                            Cancel
                        </Button>
                        <Button
                            loading={saving}
                            onClick={() =>
                                void save({
                                    ...selected,
                                    [editing.id]: {
                                        ...selected[editing.id],
                                        displayUnit: draftUnit,
                                        precision: draftPrecision ?? editing.precision,
                                    },
                                })
                            }
                        >
                            Save
                        </Button>
                    </Group>
                )}
            </Modal>
        </div>
    )
}
