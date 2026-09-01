import { metricCatalog } from './metricCatalog.js'
import type { NumericObservation } from './health.js'
import type { MetricPreferences } from './metrics.js'
import { calendarDateKey, calendarDateFromKey, addCalendarDays } from './calendar.js'

const sourcePart = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)

export type MetricSourceDescriptor = {
    key: string
    provider: string
    connector?: string
}

export function metricSourceDisplayName(provider: string) {
    if (provider === 'com.fitbit.FitbitMobile') return 'Fitbit'
    if (provider === 'com.google.android.apps.fitness') return 'Google Fit'
    if (provider === 'android') return 'Android system'
    if (provider.startsWith('com.android.healthconnect.phone.')) return 'On-device health data'
    return provider
}

export function observationSource(record: NumericObservation): MetricSourceDescriptor {
    const provider =
        record.provider ??
        sourcePart(record.metadata?.dataOrigin) ??
        sourcePart(record.metadata?.source) ??
        'Manual'
    const connector =
        record.connector ??
        sourcePart(record.metadata?.connector) ??
        (sourcePart(record.metadata?.source) === 'Health Connect' ? 'Health Connect' : undefined)
    return { key: `${connector ?? 'direct'}::${provider}`, provider, connector }
}

const exactIdentity = (record: NumericObservation) => {
    if (!record.externalId) return null
    const source = observationSource(record)
    return `${record.definitionId}::${source.key}::${record.externalId}`
}

export function removeExactDuplicates(records: NumericObservation[]) {
    const selected = new Map<string, NumericObservation>()
    const withoutIdentity: NumericObservation[] = []
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

const overlaps = (left: NumericObservation, right: NumericObservation) => {
    const leftStart = new Date(left.observedAt).getTime()
    const rightStart = new Date(right.observedAt).getTime()
    const leftEnd = new Date(left.endedAt ?? left.observedAt).getTime()
    const rightEnd = new Date(right.endedAt ?? right.observedAt).getTime()
    return leftStart <= rightEnd && rightStart <= leftEnd
}

const sourceRank = (record: NumericObservation, priority: string[]) => {
    const index = priority.indexOf(observationSource(record).key)
    return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

function resolveOverlaps(records: NumericObservation[], preferences?: MetricPreferences) {
    const result: NumericObservation[] = []
    for (const definitionId of new Set(records.map(record => record.definitionId))) {
        const pending = records
            .filter(record => record.definitionId === definitionId)
            .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        const config = preferences?.[definitionId]?.deduplication
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
        const parents = pending.map((_, index) => index)
        const find = (index: number): number =>
            parents[index] === index ? index : (parents[index] = find(parents[index]))
        const union = (left: number, right: number) => {
            const leftRoot = find(left)
            const rightRoot = find(right)
            if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot
        }
        const active: number[] = []
        for (let index = 0; index < pending.length; index += 1) {
            const candidate = pending[index]
            const start = new Date(candidate.observedAt).getTime()
            for (let activeIndex = active.length - 1; activeIndex >= 0; activeIndex--) {
                const other = pending[active[activeIndex]]
                const end = new Date(other.endedAt ?? other.observedAt).getTime()
                if (end < start) active.splice(activeIndex, 1)
            }
            for (const otherIndex of active) {
                const other = pending[otherIndex]
                if (
                    observationSource(other).key !== observationSource(candidate).key &&
                    overlaps(other, candidate)
                )
                    union(otherIndex, index)
            }
            active.push(index)
        }
        const groups = new Map<number, NumericObservation[]>()
        pending.forEach((record, index) =>
            groups.set(find(index), [...(groups.get(find(index)) ?? []), record]),
        )
        for (const group of groups.values()) {
            if (group.length === 1) {
                result.push(group[0])
            } else if (config.policy === 'prefer_priority') {
                result.push(
                    [...group].sort(
                        (a, b) =>
                            sourceRank(a, config.sourcePriority) -
                            sourceRank(b, config.sourcePriority),
                    )[0],
                )
            } else if (
                config.policy === 'metric_merge' &&
                ['steps', 'active_calories'].includes(definitionId)
            ) {
                const winner = [...group].sort((a, b) => b.canonicalValue - a.canonicalValue)[0]
                result.push({
                    ...winner,
                    id: `merged:${group
                        .map(item => item.id)
                        .sort()
                        .join(':')}`,
                    metadata: { ...winner.metadata, effectiveMerge: true },
                })
            } else {
                result.push(...group)
            }
        }
    }
    return result
}

const derivedObservation = (
    definitionId: string,
    value: number,
    observedAt: string,
    inputs: NumericObservation[],
): NumericObservation => ({
    id: `derived:${definitionId}:${inputs
        .map(item => item.id)
        .sort()
        .join(':')}`,
    definitionId,
    canonicalValue: value,
    canonicalUnit: definitionId === 'bmi' ? 'kg/m²' : 'kcal',
    originalValue: value,
    originalUnit: definitionId === 'bmi' ? 'kg/m²' : 'kcal',
    observedAt,
    sourceId: null,
    provider: 'TrackIt',
    connector: null,
    metadata: { derived: true, inputRecordIds: inputs.map(item => item.id) },
    excluded: false,
    version: 1,
})

export function deriveMetrics(records: NumericObservation[], timezone = 'UTC') {
    const derived: NumericObservation[] = []
    const heights = records
        .filter(record => record.definitionId === 'height')
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    for (const weight of records.filter(record => record.definitionId === 'weight')) {
        const eligible = heights.filter(height => height.observedAt <= weight.observedAt)
        const height = eligible.at(-1) ?? heights.at(-1)
        if (!height || height.canonicalValue <= 0) continue
        const metres = height.canonicalValue / 100
        derived.push(
            derivedObservation('bmi', weight.canonicalValue / metres ** 2, weight.observedAt, [
                weight,
                height,
            ]),
        )
    }
    const byDay = new Map<string, { intake: NumericObservation[]; burned: NumericObservation[] }>()
    for (const record of records.filter(item =>
        ['calories', 'active_calories'].includes(item.definitionId),
    )) {
        const day = calendarDateKey(new Date(record.observedAt), timezone)
        const bucket = byDay.get(day) ?? { intake: [], burned: [] }
        bucket[record.definitionId === 'calories' ? 'intake' : 'burned'].push(record)
        byDay.set(day, bucket)
    }
    for (const [day, bucket] of byDay) {
        if (!bucket.intake.length || !bucket.burned.length) continue
        const inputs = [...bucket.intake, ...bucket.burned]
        const value =
            bucket.intake.reduce((sum, item) => sum + item.canonicalValue, 0) -
            bucket.burned.reduce((sum, item) => sum + item.canonicalValue, 0)
        const nextDay = calendarDateFromKey(addCalendarDays(day, 1), timezone)
        derived.push(
            derivedObservation(
                'calorie_balance',
                value,
                new Date(nextDay.getTime() - 1).toISOString(),
                inputs,
            ),
        )
    }
    return derived
}

export function effectiveBaseMetricSeries(
    raw: NumericObservation[],
    preferences?: MetricPreferences,
) {
    const base = resolveOverlaps(
        removeExactDuplicates(raw.filter(record => !record.excluded)),
        preferences,
    )
    const derivedIds = new Set(
        metricCatalog.filter(metric => metric.derived).map(metric => metric.id),
    )
    const normalized = base.filter(record => !derivedIds.has(record.definitionId))
    return normalized.sort((a, b) => a.observedAt.localeCompare(b.observedAt))
}

export function effectiveMetricSeries(raw: NumericObservation[], preferences?: MetricPreferences) {
    return effectiveMetricSeriesInTimezone(raw, preferences, 'UTC')
}

export function effectiveMetricSeriesInTimezone(
    raw: NumericObservation[],
    preferences: MetricPreferences | undefined,
    timezone: string,
) {
    const normalized = effectiveBaseMetricSeries(raw, preferences)
    return [...normalized, ...deriveMetrics(normalized, timezone)].sort((a, b) =>
        a.observedAt.localeCompare(b.observedAt),
    )
}

export function sourcesByMetric(records: NumericObservation[]) {
    const result: Record<string, MetricSourceDescriptor[]> = {}
    for (const record of removeExactDuplicates(records)) {
        const source = observationSource(record)
        const current = result[record.definitionId] ?? []
        if (!current.some(item => item.key === source.key)) current.push(source)
        result[record.definitionId] = current
    }
    return result
}
