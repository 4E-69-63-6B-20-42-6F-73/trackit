import { metricCatalog } from './metricCatalog.js'
import type { Observation } from './health.js'
import type { MetricPreferences } from './metrics.js'

const sourcePart = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)

export type MetricSourceDescriptor = {
    key: string
    provider: string
    connector?: string
}

export function observationSource(record: Observation): MetricSourceDescriptor {
    const provider =
        record.provider ?? sourcePart(record.metadata?.dataOrigin) ?? sourcePart(record.metadata?.source) ?? 'Manual'
    const connector = record.connector ?? sourcePart(record.metadata?.connector) ??
        (sourcePart(record.metadata?.source) === 'Health Connect' ? 'Health Connect' : undefined)
    return { key: `${connector ?? 'direct'}::${provider}`, provider, connector }
}

const exactIdentity = (record: Observation) => {
    if (!record.externalId) return null
    const source = observationSource(record)
    return `${record.metric}::${source.key}::${record.externalId}`
}

export function removeExactDuplicates(records: Observation[]) {
    const selected = new Map<string, Observation>()
    const withoutIdentity: Observation[] = []
    for (const record of records) {
        const identity = exactIdentity(record)
        if (!identity) {
            withoutIdentity.push(record)
            continue
        }
        const current = selected.get(identity)
        if (!current || record.version > current.version) selected.set(identity, record)
    }
    return [...withoutIdentity, ...selected.values()]
}

const overlaps = (left: Observation, right: Observation) => {
    const leftStart = new Date(left.observedAt).getTime()
    const rightStart = new Date(right.observedAt).getTime()
    const leftEnd = new Date(left.endedAt ?? left.observedAt).getTime()
    const rightEnd = new Date(right.endedAt ?? right.observedAt).getTime()
    return leftStart <= rightEnd && rightStart <= leftEnd
}

const sourceRank = (record: Observation, priority: string[]) => {
    const index = priority.indexOf(observationSource(record).key)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

function resolveOverlaps(records: Observation[], preferences?: MetricPreferences) {
    const result: Observation[] = []
    for (const metric of new Set(records.map(record => record.metric))) {
        const pending = records
            .filter(record => record.metric === metric)
            .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        const config = preferences?.[metric]?.deduplication
        const enabled = config?.disabledSources?.length
            ? pending.filter(
                  record => !config.disabledSources!.includes(observationSource(record).key),
              )
            : pending
        pending.splice(0, pending.length, ...enabled)
        if (!config || config.policy === 'keep_all') {
            result.push(...pending)
            continue
        }
        while (pending.length) {
            const first = pending.shift()!
            const group = [first]
            for (let index = pending.length - 1; index >= 0; index--) {
                const candidate = pending[index]
                if (
                    observationSource(candidate).key !== observationSource(first).key &&
                    group.some(record => overlaps(record, candidate))
                ) {
                    group.push(candidate)
                    pending.splice(index, 1)
                }
            }
            if (group.length === 1) {
                result.push(first)
            } else if (config.policy === 'prefer_priority') {
                result.push([...group].sort((a, b) => sourceRank(a, config.sourcePriority) - sourceRank(b, config.sourcePriority))[0])
            } else if (config.policy === 'metric_merge' && ['steps', 'active_calories'].includes(metric)) {
                const winner = [...group].sort((a, b) => b.canonicalValue - a.canonicalValue)[0]
                result.push({ ...winner, id: `merged:${group.map(item => item.id).sort().join(':')}`, metadata: { ...winner.metadata, effectiveMerge: true } })
            } else {
                result.push(...group)
            }
        }
    }
    return result
}

const derivedObservation = (metric: string, value: number, observedAt: string, inputs: Observation[]): Observation => ({
    id: `derived:${metric}:${inputs.map(item => item.id).sort().join(':')}`,
    metric,
    canonicalValue: value,
    canonicalUnit: metric === 'bmi' ? 'kg/m²' : 'kcal',
    originalValue: value,
    originalUnit: metric === 'bmi' ? 'kg/m²' : 'kcal',
    observedAt,
    sourceId: null,
    provider: 'TrackIt',
    connector: null,
    metadata: { derived: true, inputRecordIds: inputs.map(item => item.id) },
    excluded: false,
    version: 1,
})

export function deriveMetrics(records: Observation[]) {
    const derived: Observation[] = []
    const heights = records.filter(record => record.metric === 'height').sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    for (const weight of records.filter(record => record.metric === 'weight')) {
        const eligible = heights.filter(height => height.observedAt <= weight.observedAt)
        const height = eligible.at(-1) ?? heights.at(-1)
        if (!height || height.canonicalValue <= 0) continue
        const metres = height.canonicalValue / 100
        derived.push(derivedObservation('bmi', weight.canonicalValue / metres ** 2, weight.observedAt, [weight, height]))
    }
    const byDay = new Map<string, { intake: Observation[]; burned: Observation[] }>()
    for (const record of records.filter(item => ['calories', 'active_calories'].includes(item.metric))) {
        const day = record.observedAt.slice(0, 10)
        const bucket = byDay.get(day) ?? { intake: [], burned: [] }
        bucket[record.metric === 'calories' ? 'intake' : 'burned'].push(record)
        byDay.set(day, bucket)
    }
    for (const [day, bucket] of byDay) {
        if (!bucket.intake.length || !bucket.burned.length) continue
        const inputs = [...bucket.intake, ...bucket.burned]
        const value = bucket.intake.reduce((sum, item) => sum + item.canonicalValue, 0) - bucket.burned.reduce((sum, item) => sum + item.canonicalValue, 0)
        derived.push(derivedObservation('calorie_balance', value, `${day}T23:59:59.999Z`, inputs))
    }
    return derived
}

export function effectiveMetricSeries(raw: Observation[], preferences?: MetricPreferences) {
    const base = resolveOverlaps(removeExactDuplicates(raw.filter(record => !record.excluded)), preferences)
    const derivedIds = new Set(metricCatalog.filter(metric => metric.derived).map(metric => metric.id))
    const normalized = base.filter(record => !derivedIds.has(record.metric))
    return [...normalized, ...deriveMetrics(normalized)].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
}

export function mealMetricObservations(
    meals: Array<{ id: string; eatenAt: string; nutrientSnapshot: Record<string, number | undefined>; version: number }>,
) {
    const units: Record<string, string> = { calories: 'kcal', sodium: 'mg', potassium: 'mg' }
    return meals.flatMap(meal =>
        Object.entries(meal.nutrientSnapshot).flatMap(([metric, value]): Observation[] => value === undefined ? [] : [{
            id: `meal:${meal.id}:${metric}`,
            metric,
            canonicalValue: value,
            canonicalUnit: units[metric] ?? 'g',
            originalValue: value,
            originalUnit: units[metric] ?? 'g',
            observedAt: meal.eatenAt,
            externalId: `${meal.id}:${metric}`,
            provider: 'Nutrition',
            connector: null,
            metadata: { recordType: 'meal_nutrient', mealId: meal.id },
            excluded: false,
            version: meal.version,
        }]),
    )
}

export function sourcesByMetric(records: Observation[]) {
    const result: Record<string, MetricSourceDescriptor[]> = {}
    for (const record of removeExactDuplicates(records)) {
        const source = observationSource(record)
        const current = result[record.metric] ?? []
        if (!current.some(item => item.key === source.key)) current.push(source)
        result[record.metric] = current
    }
    return result
}
