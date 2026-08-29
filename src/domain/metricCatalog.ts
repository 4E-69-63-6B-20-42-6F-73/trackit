export type MetricCategory = 'Body' | 'Activity' | 'Health' | 'Sleep' | 'Wellbeing' | 'Nutrition'
export type MetricSource = 'observation' | 'manual' | 'meal' | 'derived'
export type DerivedMetricDefinition = {
    inputs: readonly string[]
    calculation: 'bmi' | 'calorie_balance'
}
export type MetricAggregation = 'latest' | 'sum' | 'average' | 'min' | 'max'
export type MetricComparison = 'gte' | 'lte' | 'between'
export type GoalAggregation = 'latest' | 'average' | 'total'
export type GoalPeriodType = 'day' | 'week' | 'rolling'
export type GoalCapabilities = {
    aggregations: Partial<Record<GoalAggregation, readonly GoalPeriodType[]>>
    comparators: readonly MetricComparison[]
}
export type GoalDefaults = {
    aggregation: GoalAggregation
    period: GoalPeriodType
    rollingDays?: 7 | 14 | 30
    comparator: MetricComparison
    target: number
}

export type MetricDefinition = {
    id: string
    name: string
    category: MetricCategory
    canonicalUnit: string
    displayUnits: readonly string[]
    inputUnits?: readonly string[]
    metricUnit: string
    imperialUnit: string
    precision: number
    manuallyLoggable: boolean
    aggregations: readonly MetricAggregation[]
    comparisons: readonly MetricComparison[]
    goalCapabilities?: GoalCapabilities
    goalDefaults?: GoalDefaults
    source: MetricSource
    value: string
    label: string
    unit: string
    group: MetricCategory
    derived?: DerivedMetricDefinition
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
const goalComparators = ['gte', 'lte', 'between'] as const
const measuredGoals: GoalCapabilities = {
    aggregations: { latest: ['day', 'week', 'rolling'], average: ['week', 'rolling'] },
    comparators: goalComparators,
}
const additiveGoals: GoalCapabilities = {
    aggregations: { total: ['day', 'week', 'rolling'], average: ['week', 'rolling'] },
    comparators: goalComparators,
}
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
    {
        ...shared('steps', 'Steps', 'Activity', 'count', 'observation'),
        goalCapabilities: additiveGoals,
        goalDefaults: { aggregation: 'total', period: 'day', comparator: 'gte', target: 10_000 },
    },
    {
        ...shared('exercise', 'Exercise minutes', 'Activity', 'minutes', 'observation'),
        goalCapabilities: additiveGoals,
        goalDefaults: { aggregation: 'total', period: 'week', comparator: 'gte', target: 150 },
    },
    {
        ...shared('sleep', 'Sleep duration', 'Sleep', 'hours', 'observation'),
        goalCapabilities: {
            ...additiveGoals,
            aggregations: { total: ['week', 'rolling'], average: ['week', 'rolling'] },
        },
        goalDefaults: {
            aggregation: 'average',
            period: 'rolling',
            rollingDays: 7,
            comparator: 'gte',
            target: 8,
        },
    },
    {
        ...shared('heart_rate', 'Heart rate', 'Health', 'bpm', 'observation'),
        goalCapabilities: measuredGoals,
        goalDefaults: { aggregation: 'latest', period: 'day', comparator: 'lte', target: 80 },
    },
    {
        ...shared('resting_heart_rate', 'Resting heart rate', 'Health', 'bpm', 'observation'),
        goalCapabilities: measuredGoals,
        goalDefaults: { aggregation: 'latest', period: 'day', comparator: 'lte', target: 60 },
    },
    define({
        id: 'height',
        name: 'Height',
        category: 'Body',
        canonicalUnit: 'cm',
        displayUnits: ['cm', 'in'],
        inputUnits: ['m'],
        metricUnit: 'cm',
        imperialUnit: 'in',
        precision: 1,
        manuallyLoggable: true,
        source: 'observation',
        comparisons,
        aggregations,
        goalCapabilities: measuredGoals,
    }),
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
        goalCapabilities: measuredGoals,
        goalDefaults: {
            aggregation: 'average',
            period: 'rolling',
            rollingDays: 7,
            comparator: 'lte',
            target: 80,
        },
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
        goalCapabilities: additiveGoals,
        goalDefaults: { aggregation: 'total', period: 'day', comparator: 'gte', target: 2000 },
    }),
    {
        ...shared('energy', 'Energy', 'Wellbeing', 'score', 'manual'),
        goalCapabilities: measuredGoals,
    },
    {
        ...shared('calories', 'Calories', 'Nutrition', 'kcal', 'meal'),
        goalCapabilities: additiveGoals,
    },
    {
        ...shared('active_calories', 'Calories burned', 'Activity', 'kcal', 'observation'),
        goalCapabilities: additiveGoals,
    },
    define({
        id: 'bmi',
        name: 'BMI',
        category: 'Body',
        canonicalUnit: 'kg/m²',
        displayUnits: ['kg/m²'],
        metricUnit: 'kg/m²',
        imperialUnit: 'kg/m²',
        precision: 1,
        manuallyLoggable: false,
        source: 'derived',
        comparisons,
        aggregations,
        goalCapabilities: measuredGoals,
        derived: { inputs: ['weight', 'height'], calculation: 'bmi' },
    }),
    define({
        id: 'calorie_balance',
        name: 'Calorie balance',
        category: 'Nutrition',
        canonicalUnit: 'kcal',
        displayUnits: ['kcal'],
        metricUnit: 'kcal',
        imperialUnit: 'kcal',
        precision: 0,
        manuallyLoggable: false,
        source: 'derived',
        comparisons,
        aggregations: ['sum', 'average', 'min', 'max'],
        goalCapabilities: additiveGoals,
        derived: {
            inputs: ['calories', 'active_calories'],
            calculation: 'calorie_balance',
        },
    }),
    {
        ...shared('protein', 'Protein', 'Nutrition', 'g', 'meal', 1),
        goalCapabilities: additiveGoals,
    },
    {
        ...shared('carbs', 'Carbohydrates', 'Nutrition', 'g', 'meal', 1),
        goalCapabilities: additiveGoals,
    },
    { ...shared('fat', 'Fat', 'Nutrition', 'g', 'meal', 1), goalCapabilities: additiveGoals },
    { ...shared('fiber', 'Fiber', 'Nutrition', 'g', 'meal', 1), goalCapabilities: additiveGoals },
    { ...shared('sugar', 'Sugar', 'Nutrition', 'g', 'meal', 1), goalCapabilities: additiveGoals },
    {
        ...shared('saturatedFat', 'Saturated fat', 'Nutrition', 'g', 'meal', 1),
        goalCapabilities: additiveGoals,
    },
    { ...shared('sodium', 'Sodium', 'Nutrition', 'mg', 'meal'), goalCapabilities: additiveGoals },
    {
        ...shared('potassium', 'Potassium', 'Nutrition', 'mg', 'meal'),
        goalCapabilities: additiveGoals,
    },
]
const registry = new Map(metricCatalog.map(definition => [definition.id, definition]))
export const metricDefinition = (metric: string | null) =>
    metric ? registry.get(metric) : undefined
