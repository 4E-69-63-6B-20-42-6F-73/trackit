export type MetricCategory = 'Body' | 'Activity' | 'Health' | 'Sleep' | 'Wellbeing' | 'Nutrition'
export type MetricSource = 'observation' | 'manual' | 'meal'
export type MetricAggregation = 'latest' | 'sum' | 'average' | 'min' | 'max'
export type MetricComparison = 'gte' | 'lte' | 'between'

export type MetricDefinition = {
    id: string
    name: string
    category: MetricCategory
    canonicalUnit: string
    displayUnits: readonly string[]
    metricUnit: string
    imperialUnit: string
    precision: number
    manuallyLoggable: boolean
    aggregations: readonly MetricAggregation[]
    comparisons: readonly MetricComparison[]
    source: MetricSource
    value: string
    label: string
    unit: string
    group: MetricCategory
}
type DefinitionInput = Omit<MetricDefinition, 'value' | 'label' | 'unit' | 'group'>
const define = (d: DefinitionInput): MetricDefinition => ({
    ...d,
    value: d.id,
    label: d.name,
    unit: d.canonicalUnit,
    group: d.category,
})
const comparisons = ['gte', 'lte', 'between'] as const
const aggregations = ['latest', 'average', 'min', 'max'] as const
const shared = (
    id: string,
    name: string,
    category: MetricCategory,
    unit: string,
    source: MetricSource,
    precision = 0,
) =>
    define({
        id,
        name,
        category,
        canonicalUnit: unit,
        displayUnits: [unit],
        metricUnit: unit,
        imperialUnit: unit,
        precision,
        manuallyLoggable: source === 'manual',
        source,
        comparisons,
        aggregations,
    })

export const metricCatalog: MetricDefinition[] = [
    shared('steps', 'Steps', 'Activity', 'count', 'observation'),
    shared('exercise', 'Exercise minutes', 'Activity', 'minutes', 'observation'),
    shared('sleep', 'Sleep duration', 'Sleep', 'hours', 'observation'),
    shared('heart_rate', 'Heart rate', 'Health', 'bpm', 'observation'),
    shared('resting_heart_rate', 'Resting heart rate', 'Health', 'bpm', 'observation'),
    define({
        id: 'weight',
        name: 'Weight',
        category: 'Body',
        canonicalUnit: 'kg',
        displayUnits: ['kg', 'lb'],
        metricUnit: 'kg',
        imperialUnit: 'lb',
        precision: 1,
        manuallyLoggable: true,
        source: 'observation',
        comparisons,
        aggregations,
    }),
    define({
        id: 'water',
        name: 'Water',
        category: 'Nutrition',
        canonicalUnit: 'ml',
        displayUnits: ['ml', 'L', 'fl oz'],
        metricUnit: 'ml',
        imperialUnit: 'fl oz',
        precision: 0,
        manuallyLoggable: true,
        source: 'manual',
        comparisons,
        aggregations: ['sum', 'average', 'min', 'max'],
    }),
    shared('energy', 'Energy', 'Wellbeing', 'score', 'manual'),
    shared('calories', 'Calories', 'Nutrition', 'kcal', 'meal'),
    shared('protein', 'Protein', 'Nutrition', 'g', 'meal', 1),
    shared('carbs', 'Carbohydrates', 'Nutrition', 'g', 'meal', 1),
    shared('fat', 'Fat', 'Nutrition', 'g', 'meal', 1),
    shared('fiber', 'Fiber', 'Nutrition', 'g', 'meal', 1),
    shared('sugar', 'Sugar', 'Nutrition', 'g', 'meal', 1),
    shared('saturatedFat', 'Saturated fat', 'Nutrition', 'g', 'meal', 1),
    shared('sodium', 'Sodium', 'Nutrition', 'mg', 'meal'),
    shared('potassium', 'Potassium', 'Nutrition', 'mg', 'meal'),
]
const registry = new Map(metricCatalog.map(definition => [definition.id, definition]))
export const metricDefinition = (metric: string | null) =>
    metric ? registry.get(metric) : undefined
