export type MetricDefinition = {
    value: string
    label: string
    unit: string
    group: 'Activity' | 'Sleep' | 'Heart' | 'Body' | 'Daily input' | 'Nutrition'
    source: 'observation' | 'manual' | 'meal'
}

export const metricCatalog: MetricDefinition[] = [
    { value: 'steps', label: 'Steps', unit: 'count', group: 'Activity', source: 'observation' },
    {
        value: 'exercise',
        label: 'Exercise duration',
        unit: 'minutes',
        group: 'Activity',
        source: 'observation',
    },
    {
        value: 'sleep',
        label: 'Sleep duration',
        unit: 'hours',
        group: 'Sleep',
        source: 'observation',
    },
    {
        value: 'heart_rate',
        label: 'Heart rate',
        unit: 'bpm',
        group: 'Heart',
        source: 'observation',
    },
    {
        value: 'resting_heart_rate',
        label: 'Resting heart rate',
        unit: 'bpm',
        group: 'Heart',
        source: 'observation',
    },
    { value: 'weight', label: 'Weight', unit: 'kg', group: 'Body', source: 'observation' },
    { value: 'water', label: 'Water', unit: 'ml', group: 'Daily input', source: 'manual' },
    { value: 'energy', label: 'Energy', unit: 'score', group: 'Daily input', source: 'manual' },
    { value: 'calories', label: 'Calories', unit: 'kcal', group: 'Nutrition', source: 'meal' },
    { value: 'protein', label: 'Protein', unit: 'g', group: 'Nutrition', source: 'meal' },
    { value: 'carbs', label: 'Carbohydrates', unit: 'g', group: 'Nutrition', source: 'meal' },
    { value: 'fat', label: 'Fat', unit: 'g', group: 'Nutrition', source: 'meal' },
    { value: 'fiber', label: 'Fiber', unit: 'g', group: 'Nutrition', source: 'meal' },
    { value: 'sugar', label: 'Sugar', unit: 'g', group: 'Nutrition', source: 'meal' },
    {
        value: 'saturatedFat',
        label: 'Saturated fat',
        unit: 'g',
        group: 'Nutrition',
        source: 'meal',
    },
    { value: 'sodium', label: 'Sodium', unit: 'mg', group: 'Nutrition', source: 'meal' },
    { value: 'potassium', label: 'Potassium', unit: 'mg', group: 'Nutrition', source: 'meal' },
]

export const metricDefinition = (metric: string | null) =>
    metricCatalog.find(definition => definition.value === metric)
