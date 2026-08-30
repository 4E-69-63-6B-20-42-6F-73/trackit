import type { MetricDefinition } from './metricCatalog'

const headlinePriority = new Map([
    ['sleep', 0],
    ['heart_rate', 1],
    ['resting_heart_rate', 2],
    ['energy', 3],
    ['weight', 4],
])

const detailMetricIds = new Set(['sleep_awake', 'sleep_deep', 'sleep_light', 'sleep_rem'])
const categoryOrder = ['Sleep', 'Health', 'Wellbeing', 'Body', 'Activity'] as const

export const isTodayHeadlineMetric = (definition: MetricDefinition) =>
    definition.category !== 'Nutrition' &&
    !['steps', 'active_calories'].includes(definition.id) &&
    !detailMetricIds.has(definition.id)

export const compareTodayHeadlineMetrics = (
    left: MetricDefinition,
    right: MetricDefinition,
) => {
    const leftPriority = headlinePriority.get(left.id)
    const rightPriority = headlinePriority.get(right.id)

    if (leftPriority !== undefined || rightPriority !== undefined) {
        if (leftPriority === undefined) return 1
        if (rightPriority === undefined) return -1
        if (leftPriority !== rightPriority) return leftPriority - rightPriority
    }

    const leftCategory = categoryOrder.indexOf(
        left.category as (typeof categoryOrder)[number],
    )
    const rightCategory = categoryOrder.indexOf(
        right.category as (typeof categoryOrder)[number],
    )
    const leftRank = leftCategory === -1 ? categoryOrder.length : leftCategory
    const rightRank = rightCategory === -1 ? categoryOrder.length : rightCategory

    return leftRank - rightRank || left.name.localeCompare(right.name)
}
