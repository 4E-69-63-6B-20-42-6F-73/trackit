import {
    Alert,
    Badge,
    Button,
    Group,
    Menu,
    Modal,
    SegmentedControl,
    Select,
    Text,
    TextInput,
} from '@mantine/core'
import {
    IconAdjustments,
    IconChartLine,
    IconChevronDown,
    IconPlugConnected,
} from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CorrelationNote } from '../components/CorrelationNote'
import { ObservationRecords } from '../components/ObservationRecords'
import { TrendChart } from '../components/TrendChart'
import {
    dailySeries,
    displayValue,
    weeklySeries,
    type Observation,
    type TrendGranularity,
} from '../domain/health'
import { metricCatalog, metricDefinition } from '../domain/metricCatalog'
import type { Nutrients } from '../domain/nutrition'
import { listMeals, type MealRecord } from '../lib/nutritionApi'
import { listObservations, setObservationExcluded } from '../lib/observationApi'
import { getPreferences, updatePreferences, type Preferences } from '../lib/preferencesApi'
import { listTrendViews, saveTrendView, type TrendViewRecord } from '../lib/trendApi'

const ranges = { '7 days': 7, '30 days': 30, '90 days': 90 } as const

const metricLabel = (metric: string) =>
    metricDefinition(metric)?.label ??
    metric.replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())

const nutrientMetrics: (keyof Nutrients)[] = [
    'calories',
    'protein',
    'carbs',
    'fat',
    'fiber',
    'sugar',
    'saturatedFat',
    'sodium',
    'potassium',
]

export function Trends() {
    const navigate = useNavigate()
    const [observations, setObservations] = useState<Observation[]>([])
    const [meals, setMeals] = useState<MealRecord[]>([])
    const [mealsLoading, setMealsLoading] = useState(true)
    const [range, setRange] = useState<keyof typeof ranges>('7 days')
    const [metric, setMetric] = useState<string | null>(null)
    const [comparisonMetric, setComparisonMetric] = useState<string | null>(null)
    const [showCompare, setShowCompare] = useState(false)
    const [granularity, setGranularity] = useState<TrendGranularity>('daily')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)
    const [savedViews, setSavedViews] = useState<TrendViewRecord[]>([])
    const [selectedView, setSelectedView] = useState<string | null>(null)
    const [inspectedIds, setInspectedIds] = useState<string[] | null>(null)
    const [preferences, setPreferences] = useState<Preferences | null>(null)
    const [actionError, setActionError] = useState('')
    const [experimentOpen, setExperimentOpen] = useState(false)
    const [experimentQuestion, setExperimentQuestion] = useState('')

    useEffect(() => {
        const from = new Date()
        from.setUTCDate(from.getUTCDate() - 180)
        void listObservations({ from: from.toISOString() })
            .then(records => {
                setObservations(records)
                const preferred = ['sleep', 'steps', 'weight', 'energy'].find(candidate =>
                    records.some(record => record.metric === candidate),
                )
                setMetric(preferred ?? records[0]?.metric ?? null)
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false))
        void listMeals({ from: from.toISOString() })
            .then(records => {
                setMeals(records)
                setMetric(current => current ?? (records.length ? 'calories' : null))
            })
            .catch(() => undefined)
            .finally(() => setMealsLoading(false))
        void listTrendViews()
            .then(setSavedViews)
            .catch(() => undefined)
        void getPreferences()
            .then(setPreferences)
            .catch(() => undefined)
    }, [])

    const nutritionObservations: Observation[] = meals.flatMap(meal =>
        nutrientMetrics.flatMap(nutrient => {
            const value = meal.nutrientSnapshot[nutrient]
            if (value === undefined) return []
            return [
                {
                    id: `${meal.id}:${nutrient}`,
                    metric: nutrient,
                    canonicalValue: value,
                    canonicalUnit:
                        nutrient === 'calories'
                            ? 'kcal'
                            : ['sodium', 'potassium'].includes(nutrient)
                              ? 'mg'
                              : 'g',
                    originalValue: value,
                    originalUnit:
                        nutrient === 'calories'
                            ? 'kcal'
                            : ['sodium', 'potassium'].includes(nutrient)
                              ? 'mg'
                              : 'g',
                    observedAt: meal.eatenAt,
                    excluded: false,
                    version: meal.version,
                    metadata: { recordType: 'meal_nutrient', mealId: meal.id },
                },
            ]
        }),
    )
    const allObservations = [...observations, ...nutritionObservations]
    const recordedMetrics = [...new Set(allObservations.map(record => record.metric))]
    const unknownMetrics = recordedMetrics.filter(
        value => !metricCatalog.some(definition => definition.value === value),
    )
    const metricOptions = [
        ...Array.from(new Set(metricCatalog.map(definition => definition.group))).map(group => ({
            group,
            items: metricCatalog
                .filter(definition => definition.group === group)
                .map(definition => ({ value: definition.value, label: definition.label })),
        })),
        ...(unknownMetrics.length
            ? [
                  {
                      group: 'Other recorded metrics',
                      items: unknownMetrics.map(value => ({ value, label: metricLabel(value) })),
                  },
              ]
            : []),
    ]
    const start = useMemo(() => {
        const value = new Date()
        value.setUTCHours(12, 0, 0, 0)
        value.setUTCDate(value.getUTCDate() - ranges[range] + 1)
        return value
    }, [range])
    const metricRecords = allObservations.filter(
        record => record.metric === metric && !record.excluded,
    )
    const isNutritionMetric = metricDefinition(metric)?.source === 'meal'
    const isManualMetric = metricDefinition(metric)?.source === 'manual'
    const displayUnit =
        preferences?.units === 'imperial' && metricRecords[0]?.canonicalUnit === 'kg'
            ? 'lb'
            : metricRecords[0]?.canonicalUnit
    const convert = (value: number) =>
        metricRecords[0]?.canonicalUnit && displayUnit
            ? displayValue(value, metricRecords[0].canonicalUnit, displayUnit)
            : value
    const points = (() => {
        const series = (granularity === 'weekly' ? weeklySeries : dailySeries)(
            metricRecords,
            start,
            ranges[range],
            preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        )
        return series.map(point => ({
            ...point,
            value: point.value === null ? null : convert(point.value),
        }))
    })()
    const coveredValues = points.flatMap(point => (point.value === null ? [] : [point.value]))
    const comparisonRecords = allObservations.filter(
        record => record.metric === comparisonMetric && !record.excluded,
    )
    const comparisonPoints = (granularity === 'weekly' ? weeklySeries : dailySeries)(
        comparisonRecords,
        start,
        ranges[range],
        preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    )
    const average = coveredValues.length
        ? coveredValues.reduce((total, value) => total + value, 0) / coveredValues.length
        : null
    const change =
        coveredValues.length >= 2
            ? coveredValues[coveredValues.length - 1] - coveredValues[0]
            : null
    const variation = coveredValues.length
        ? Math.max(...coveredValues) - Math.min(...coveredValues)
        : null
    const pageLoading = loading || mealsLoading
    const coverageRatio = points.length ? coveredValues.length / points.length : 0
    const confidence =
        coverageRatio >= 0.75
            ? 'High coverage'
            : coverageRatio >= 0.4
              ? 'Partial coverage'
              : 'Low coverage'

    const toggleExcluded = async (observation: Observation) => {
        try {
            const updated = await setObservationExcluded(observation, !observation.excluded)
            setObservations(current =>
                current.map(record => (record.id === updated.id ? updated : record)),
            )
            setActionError('')
        } catch {
            setActionError('The observation could not be updated. Try again.')
        }
    }
    const saveView = async () => {
        if (!metric) return
        try {
            const saved = await saveTrendView({
                name: `${metricLabel(metric)} · ${range}`,
                metric,
                comparisonMetric: comparisonMetric ?? undefined,
                rangeDays: ranges[range],
                granularity,
            })
            setSavedViews(current => [saved, ...current])
            setSelectedView(saved.id)
            setActionError('')
        } catch {
            setActionError('The trend view could not be saved. Try again.')
        }
    }
    const loadView = (id: string | null) => {
        setSelectedView(id)
        const view = savedViews.find(item => item.id === id)
        if (!view) return
        setMetric(view.metric)
        setComparisonMetric(view.comparisonMetric)
        setShowCompare(Boolean(view.comparisonMetric))
        setGranularity(view.granularity)
        const nextRange = Object.entries(ranges).find(([, days]) => days === view.rangeDays)?.[0]
        if (nextRange) setRange(nextRange as keyof typeof ranges)
    }

    return (
        <div className="page-content trends-page">
            <h1>Trends</h1>
            <Text className="subhead">See how your recorded health changes over time.</Text>
            {!pageLoading && ((error && meals.length === 0) || allObservations.length === 0) ? (
                <section className="panel page-empty">
                    <IconChartLine size={28} />
                    <h2>{error ? 'Trends are unavailable' : 'No trends to show yet'}</h2>
                    <Text c="dimmed" size="sm">
                        {error
                            ? 'TrackIt could not load your observations. Review the server and data-source connection.'
                            : 'Charts, averages, and changes will appear after health measurements have been added or synced.'}
                    </Text>
                    <Button
                        leftSection={<IconPlugConnected size={17} />}
                        onClick={() => navigate('/connections')}
                    >
                        Connect health data
                    </Button>
                </section>
            ) : (
                <section className="panel chart-large">
                    {error && meals.length > 0 && (
                        <Alert color="orange" mb="md">
                            Health observations are unavailable, but nutrition trends from saved
                            meals remain available.
                        </Alert>
                    )}
                    <div className="trend-questions" aria-label="Questions to explore">
                        <div>
                            <Text fw={700}>What would you like to understand?</Text>
                            <Text size="sm" c="dimmed">
                                Start with a question, then refine the chart if you need more
                                detail.
                            </Text>
                        </div>
                        <div className="trend-question-actions">
                            {[
                                { label: 'How has my sleep changed?', primary: 'sleep' },
                                { label: 'How active have I been?', primary: 'steps' },
                                {
                                    label: 'Compare sleep and energy',
                                    primary: 'sleep',
                                    secondary: 'energy',
                                },
                                { label: 'How is my nutrition changing?', primary: 'protein' },
                            ].map(question => (
                                <Button
                                    key={question.label}
                                    size="compact-sm"
                                    variant="default"
                                    onClick={() => {
                                        setMetric(question.primary)
                                        setComparisonMetric(question.secondary ?? null)
                                        setShowCompare(Boolean(question.secondary))
                                        setInspectedIds(null)
                                    }}
                                >
                                    {question.label}
                                </Button>
                            ))}
                            <Button
                                size="compact-sm"
                                variant="light"
                                onClick={() => setExperimentOpen(true)}
                            >
                                Start a personal experiment
                            </Button>
                        </div>
                        {(preferences?.experience?.experiments ?? [])
                            .filter(item => item.status === 'active')
                            .map(experiment => (
                                <button
                                    className="experiment-link"
                                    key={experiment.id}
                                    onClick={() => {
                                        setMetric(experiment.primaryMetric)
                                        setComparisonMetric(experiment.comparisonMetric ?? null)
                                        setShowCompare(Boolean(experiment.comparisonMetric))
                                    }}
                                >
                                    <span>Active experiment</span>
                                    <strong>{experiment.question}</strong>
                                </button>
                            ))}
                    </div>
                    <div className="trend-primary-controls">
                        <Select
                            label="Metric"
                            aria-label="Trend metric"
                            value={metric}
                            onChange={value => {
                                setMetric(value)
                                setInspectedIds(null)
                            }}
                            data={metricOptions}
                        />
                        <Select
                            label="Date range"
                            value={range}
                            onChange={value => {
                                if (value) setRange(value as keyof typeof ranges)
                                setInspectedIds(null)
                            }}
                            data={Object.keys(ranges)}
                            allowDeselect={false}
                        />
                        <Button
                            variant={showCompare ? 'light' : 'default'}
                            onClick={() => setShowCompare(value => !value)}
                        >
                            Compare
                        </Button>
                        <Menu position="bottom-end">
                            <Menu.Target>
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    rightSection={<IconChevronDown size={14} />}
                                    leftSection={<IconAdjustments size={16} />}
                                >
                                    More
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>Aggregation</Menu.Label>
                                <Menu.Item closeMenuOnClick={false}>
                                    <SegmentedControl
                                        aria-label="Trend aggregation"
                                        size="xs"
                                        data={[
                                            { label: 'Daily', value: 'daily' },
                                            { label: 'Weekly', value: 'weekly' },
                                        ]}
                                        value={granularity}
                                        onChange={value =>
                                            setGranularity(value as TrendGranularity)
                                        }
                                    />
                                </Menu.Item>
                                <Menu.Divider />
                                <Menu.Item onClick={() => void saveView()}>
                                    Save current view
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </div>
                    {showCompare && (
                        <Select
                            className="trend-compare"
                            clearable
                            label="Compare with"
                            value={comparisonMetric}
                            onChange={setComparisonMetric}
                            data={metricCatalog
                                .filter(definition => definition.value !== metric)
                                .map(definition => ({
                                    value: definition.value,
                                    label: definition.label,
                                }))}
                            placeholder="Choose a second metric"
                        />
                    )}
                    {savedViews.length > 0 && (
                        <Select
                            mt="sm"
                            maw={260}
                            clearable
                            label="Saved view"
                            value={selectedView}
                            onChange={loadView}
                            data={savedViews.map(view => ({ label: view.name, value: view.id }))}
                        />
                    )}
                    {average !== null && (
                        <div className="trend-summary" aria-label="Trend summary">
                            <div>
                                <Text size="xs" c="dimmed">
                                    Average
                                </Text>
                                <Text fw={700}>
                                    {average.toLocaleString(undefined, {
                                        maximumFractionDigits: 1,
                                    })}{' '}
                                    {displayUnit}
                                </Text>
                            </div>
                            <div>
                                <Text size="xs" c="dimmed">
                                    Period change
                                </Text>
                                <Text fw={700}>
                                    {change === null
                                        ? 'Needs 2 points'
                                        : `${change > 0 ? '+' : ''}${change.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${displayUnit ?? ''}`}
                                </Text>
                            </div>
                            <div>
                                <Text size="xs" c="dimmed">
                                    Variation
                                </Text>
                                <Text fw={700}>
                                    {variation?.toLocaleString(undefined, {
                                        maximumFractionDigits: 1,
                                    })}{' '}
                                    {displayUnit}
                                </Text>
                            </div>
                            <div>
                                <Text size="xs" c="dimmed">
                                    Coverage
                                </Text>
                                <Text fw={700}>
                                    {coveredValues.length}{' '}
                                    {granularity === 'weekly' ? 'weeks' : 'days'}
                                </Text>
                                <Badge
                                    mt={4}
                                    size="xs"
                                    color={
                                        coverageRatio >= 0.75
                                            ? 'teal'
                                            : coverageRatio >= 0.4
                                              ? 'yellow'
                                              : 'gray'
                                    }
                                >
                                    {confidence}
                                </Badge>
                            </div>
                        </div>
                    )}
                    {average !== null && (
                        <Text size="sm" c="dimmed" className="trend-confidence-note">
                            Based on {coveredValues.length} of {points.length} expected{' '}
                            {granularity === 'weekly' ? 'weeks' : 'days'}. Missing periods are shown
                            rather than estimated. Inspect the chart to review underlying records.
                        </Text>
                    )}
                    {!pageLoading && coveredValues.length === 0 ? (
                        <div className="trend-metric-empty">
                            <Text fw={650}>
                                No {metric ? metricLabel(metric).toLowerCase() : 'metric'} data in
                                this range
                            </Text>
                            <Text size="sm" c="dimmed">
                                {isNutritionMetric
                                    ? 'Daily totals will appear after meals containing this nutrient are logged.'
                                    : isManualMetric
                                      ? 'Recorded values will appear here after you add them on Today.'
                                      : 'Recorded values will appear here after they are synced.'}
                            </Text>
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() =>
                                    navigate(
                                        isNutritionMetric
                                            ? '/nutrition'
                                            : isManualMetric
                                              ? '/today'
                                              : '/connections',
                                    )
                                }
                            >
                                {isNutritionMetric
                                    ? 'Log food'
                                    : isManualMetric
                                      ? 'Add on Today'
                                      : 'Connect health data'}
                            </Button>
                        </div>
                    ) : (
                        <TrendChart
                            points={points}
                            loading={pageLoading}
                            error={error && !isNutritionMetric}
                            metric={metric ?? ''}
                            onInspect={isNutritionMetric ? undefined : setInspectedIds}
                            comparisonPoints={comparisonMetric ? comparisonPoints : undefined}
                            comparisonLabel={
                                comparisonMetric ? metricLabel(comparisonMetric) : undefined
                            }
                            periodLabel={granularity === 'weekly' ? 'week' : 'day'}
                        />
                    )}
                    {actionError && (
                        <Alert role="alert" color="orange">
                            {actionError}
                        </Alert>
                    )}
                    {metric && comparisonMetric && (
                        <CorrelationNote
                            observations={allObservations}
                            metric={metric}
                            comparisonMetric={comparisonMetric}
                            start={start}
                            days={ranges[range]}
                            timezone={
                                preferences?.timezone ??
                                Intl.DateTimeFormat().resolvedOptions().timeZone
                            }
                        />
                    )}
                    {isNutritionMetric && coveredValues.length > 0 && (
                        <div className="chart-note">
                            <IconChartLine size={18} />
                            <Text size="sm">
                                Nutrition totals are calculated from meal nutrient snapshots. Edit
                                or correct those meals on the Nutrition page.
                            </Text>
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() => navigate('/nutrition')}
                            >
                                Review meals
                            </Button>
                        </div>
                    )}
                    <ObservationRecords
                        observations={observations.filter(
                            record =>
                                record.metric === metric &&
                                (!inspectedIds || inspectedIds.includes(record.id)),
                        )}
                        onToggleExcluded={observation => void toggleExcluded(observation)}
                        showAll={Boolean(inspectedIds)}
                    />
                    <Modal
                        opened={experimentOpen}
                        onClose={() => setExperimentOpen(false)}
                        title="Start a personal experiment"
                        centered
                    >
                        <Text size="sm" c="dimmed" mb="md">
                            Track a question over time without treating an association as medical
                            advice or proof of cause.
                        </Text>
                        <TextInput
                            label="Question"
                            value={experimentQuestion}
                            onChange={event => setExperimentQuestion(event.currentTarget.value)}
                            placeholder="For example, do I report more energy after longer sleep?"
                        />
                        <Group justify="flex-end" mt="lg">
                            <Button variant="default" onClick={() => setExperimentOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                disabled={!experimentQuestion.trim() || !metric}
                                onClick={async () => {
                                    if (!preferences || !metric) return
                                    const experience = preferences.experience ?? {}
                                    try {
                                        const saved = await updatePreferences({
                                            experience: {
                                                ...experience,
                                                experiments: [
                                                    ...(experience.experiments ?? []),
                                                    {
                                                        id: crypto.randomUUID(),
                                                        question: experimentQuestion.trim(),
                                                        primaryMetric: metric,
                                                        comparisonMetric:
                                                            comparisonMetric ?? undefined,
                                                        startedAt: new Date().toISOString(),
                                                        status: 'active',
                                                    },
                                                ],
                                            },
                                        })
                                        setPreferences(saved)
                                        setExperimentQuestion('')
                                        setExperimentOpen(false)
                                    } catch {
                                        setActionError(
                                            'The experiment could not be saved to your server.',
                                        )
                                    }
                                }}
                            >
                                Start experiment
                            </Button>
                        </Group>
                    </Modal>
                </section>
            )}
        </div>
    )
}
