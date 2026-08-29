import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Modal,
    Radio,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core'
import { IconArrowDown, IconArrowLeft, IconArrowUp } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { listMetricSources, type MetricSourceSummary } from '../lib/observationApi'
import { metricSourceDisplayName, type MetricSourceDescriptor } from '../domain/effectiveMetrics'
import type { DeduplicationPolicy } from '../domain/metrics'

export function Metrics() {
    const { preferences, loading } = useServerData()
    const [editing, setEditing] = useState<MetricDefinition | null>(null)
    const [draftUnit, setDraftUnit] = useState('')
    const [draftPrecision, setDraftPrecision] = useState<number | null>(null)
    const [draftPolicy, setDraftPolicy] = useState<DeduplicationPolicy>('keep_all')
    const [draftSourcePriority, setDraftSourcePriority] = useState<string[]>([])
    const [draftDisabledSources, setDraftDisabledSources] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState('')
    const [sourceSummaries, setSourceSummaries] = useState<MetricSourceSummary[]>([])
    const selected = normalizedMetricPreferences(preferences?.metricPreferences, 'metric')
    const preset = detectUnitPreset(selected)
    const categories = useMemo(() => [...new Set(metricCatalog.map(metric => metric.category))], [])
    const metricSources = useMemo(
        () =>
            sourceSummaries.reduce<Record<string, MetricSourceDescriptor[]>>((result, source) => {
                const descriptor = {
                    key: `${source.connector ?? 'direct'}::${source.provider}`,
                    provider: source.provider,
                    connector: source.connector ?? undefined,
                }
                ;(result[source.definitionId] ??= []).push(descriptor)
                return result
            }, {}),
        [sourceSummaries],
    )
    useEffect(() => {
        const controller = new AbortController()
        void listMetricSources(controller.signal)
            .then(setSourceSummaries)
            .catch(() => undefined)
        return () => controller.abort()
    }, [])
    const save = async (metricPreferences: typeof selected, close = true) => {
        if (!preferences) return
        setSaving(true)
        setMessage('')
        try {
            await updatePreferences({ metricPreferences })
            if (close) setEditing(null)
        } catch {
            setMessage('Your Metric Center preference could not be saved. Try again.')
        } finally {
            setSaving(false)
        }
    }
    const applyPreset = (next: string) => {
        if (next === 'custom' || !preferences) return
        const presetPreferences = preferencesForPreset(next as Exclude<UnitPreset, 'custom'>)
        void save(
            Object.fromEntries(
                Object.entries(presetPreferences).map(([id, preference]) => [
                    id,
                    { ...selected[id], displayUnit: preference.displayUnit },
                ]),
            ),
            false,
        )
    }
    const openMetric = (metric: MetricDefinition) => {
        setEditing(metric)
        setDraftUnit(selected[metric.id].displayUnit)
        setDraftPrecision(selected[metric.id].precision ?? metric.precision)
        setDraftPolicy(selected[metric.id].deduplication?.policy ?? 'keep_all')
        setDraftDisabledSources(selected[metric.id].deduplication?.disabledSources ?? [])
        setDraftSourcePriority([
            ...(selected[metric.id].deduplication?.sourcePriority ?? []),
            ...(metricSources[metric.id] ?? [])
                .map(source => source.key)
                .filter(key => !selected[metric.id].deduplication?.sourcePriority.includes(key)),
        ])
    }
    const moveSource = (index: number, direction: -1 | 1) => {
        const next = [...draftSourcePriority]
        const target = index + direction
        if (target < 0 || target >= next.length) return
        ;[next[index], next[target]] = [next[target], next[index]]
        setDraftSourcePriority(next)
    }
    return (
        <div className="page-content metrics-page">
            <PageHeader
                title="Metric Center"
                description="Configure definitions, display units, formatting, and source resolution."
                actions={
                    <Button
                        component={Link}
                        to="/library"
                        variant="subtle"
                        color="gray"
                        leftSection={<IconArrowLeft size={16} />}
                    >
                        Back to Library
                    </Button>
                }
            />
            <section className="panel metrics-units" aria-labelledby="unit-system-heading">
                <Text id="unit-system-heading" fw={700}>
                    Display unit presets
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                    Apply a convenient preset or customize individual metric definitions below.
                </Text>
                <SegmentedControl
                    aria-label="Display unit preset"
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
                                    metric.displayUnits.length > 1 ||
                                    metric.precision > 0 ||
                                    Boolean(metric.derived) ||
                                    (metricSources[metric.id]?.length ?? 0) > 1
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
                {editing && editing.displayUnits.length > 1 && (
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
                {editing?.derived && (
                    <section className="metric-derived-note">
                        <Text fw={650} size="sm">
                            Calculated automatically
                        </Text>
                        <Text size="sm" c="dimmed">
                            Uses{' '}
                            {editing.derived.inputs
                                .map(
                                    input =>
                                        metricCatalog.find(metric => metric.id === input)?.name ??
                                        input,
                                )
                                .join(' and ')}{' '}
                            from your effective metric series.
                        </Text>
                    </section>
                )}
                {editing && (metricSources[editing.id]?.length ?? 0) > 1 && (
                    <section
                        className="metric-source-settings"
                        aria-labelledby="metric-data-sources"
                    >
                        <div>
                            <Text id="metric-data-sources" fw={650}>
                                Data sources
                            </Text>
                            <Text size="sm" c="dimmed">
                                Choose which sources contribute to {editing.name}, goals, trends,
                                and derived metrics.
                            </Text>
                        </div>
                        <div className="metric-source-list">
                            <div className="metric-source-list-heading" aria-hidden="true">
                                <span />
                                <span />
                                <Text size="xs" c="dimmed">
                                    Included
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Priority
                                </Text>
                            </div>
                            {draftSourcePriority.map((key, index) => {
                                const source = metricSources[editing.id].find(
                                    item => item.key === key,
                                )
                                if (!source) return null
                                const included = !draftDisabledSources.includes(key)
                                const sourceName = metricSourceDisplayName(source.provider)
                                return (
                                    <div className="metric-source-row" key={key}>
                                        <Text size="sm" c="dimmed" aria-hidden="true">
                                            {index + 1}
                                        </Text>
                                        <div>
                                            <Text size="sm" fw={600}>
                                                {sourceName}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {source.connector
                                                    ? `via ${source.connector}`
                                                    : 'Direct entry'}
                                                {!included && ' · Excluded'}
                                            </Text>
                                        </div>
                                        <Switch
                                            size="sm"
                                            checked={included}
                                            aria-label={`Include ${sourceName} in ${editing.name}`}
                                            onChange={event => {
                                                const enabled = event.currentTarget.checked
                                                setDraftDisabledSources(current =>
                                                    enabled
                                                        ? current.filter(item => item !== key)
                                                        : [...current, key],
                                                )
                                            }}
                                        />
                                        <Group gap={4} wrap="nowrap" justify="flex-end">
                                            <ActionIcon
                                                variant="subtle"
                                                disabled={
                                                    draftPolicy !== 'prefer_priority' ||
                                                    !included ||
                                                    index === 0 ||
                                                    saving
                                                }
                                                aria-label={`Move ${sourceName} up`}
                                                onClick={() => moveSource(index, -1)}
                                            >
                                                <IconArrowUp size={16} />
                                            </ActionIcon>
                                            <ActionIcon
                                                variant="subtle"
                                                disabled={
                                                    draftPolicy !== 'prefer_priority' ||
                                                    !included ||
                                                    index === draftSourcePriority.length - 1 ||
                                                    saving
                                                }
                                                aria-label={`Move ${sourceName} down`}
                                                onClick={() => moveSource(index, 1)}
                                            >
                                                <IconArrowDown size={16} />
                                            </ActionIcon>
                                        </Group>
                                    </div>
                                )
                            })}
                        </div>
                        <Select
                            label="When included sources overlap"
                            value={draftPolicy}
                            disabled={saving}
                            onChange={value =>
                                value && setDraftPolicy(value as DeduplicationPolicy)
                            }
                            data={[
                                { value: 'keep_all', label: 'Keep all records' },
                                {
                                    value: 'prefer_priority',
                                    label: 'Prefer higher-priority source',
                                },
                                ...(['steps', 'active_calories'].includes(editing.id)
                                    ? [
                                          {
                                              value: 'metric_merge',
                                              label: 'Merge overlapping records',
                                          },
                                      ]
                                    : []),
                            ]}
                        />
                        <Text size="xs" c="dimmed">
                            {draftPolicy === 'prefer_priority'
                                ? 'The highest included source is used when records overlap.'
                                : draftPolicy === 'metric_merge'
                                  ? `Overlapping records are combined using the ${editing.name} merge rule.`
                                  : 'All included records contribute. Priority is not currently used.'}
                        </Text>
                        <Text size="xs" c="dimmed">
                            Excluding a source affects {editing.name} only. Original records are
                            always retained.
                        </Text>
                    </section>
                )}
                {editing &&
                    (editing.displayUnits.length > 1 ||
                    editing.precision > 0 ||
                    (metricSources[editing.id]?.length ?? 0) > 1 ? (
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
                                            ...((metricSources[editing.id]?.length ?? 0) > 1
                                                ? {
                                                      deduplication: {
                                                          policy: draftPolicy,
                                                          sourcePriority: draftSourcePriority,
                                                          disabledSources: draftDisabledSources,
                                                      },
                                                  }
                                                : {}),
                                        },
                                    })
                                }
                            >
                                Save
                            </Button>
                        </Group>
                    ) : (
                        <Group justify="flex-end" mt="xl">
                            <Button onClick={() => setEditing(null)}>Close</Button>
                        </Group>
                    ))}
            </Modal>
        </div>
    )
}
