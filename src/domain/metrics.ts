import { metricCatalog, metricDefinition } from './metricCatalog'
export type UnitPreset = 'metric' | 'imperial' | 'custom'
export type MetricPreference = { displayUnit: string; precision?: number }
export type MetricPreferences = Record<string, MetricPreference>
export type UnitPresentation = { label: string; name: string }
const unitPresentations: Record<string, UnitPresentation> = {
    count: { label: 'steps', name: 'Steps' },
    minutes: { label: 'min', name: 'Minutes' },
    hours: { label: 'h', name: 'Hours' },
    bpm: { label: 'bpm', name: 'Beats per minute' },
    kg: { label: 'kg', name: 'Kilograms' },
    lb: { label: 'lb', name: 'Pounds' },
    ml: { label: 'ml', name: 'Millilitres' },
    L: { label: 'L', name: 'Litres' },
    'fl oz': { label: 'fl oz', name: 'Fluid ounces' },
    score: { label: '/10', name: 'Score out of 10' },
    kcal: { label: 'kcal', name: 'Kilocalories' },
    g: { label: 'g', name: 'Grams' },
    mg: { label: 'mg', name: 'Milligrams' },
}
export const unitPresentation = (unit: string): UnitPresentation =>
    unitPresentations[unit] ?? { label: unit, name: unit }
const factors: Record<string, number> = {
    kg: 1,
    lb: 0.45359237,
    ml: 1,
    L: 1000,
    'fl oz': 29.5735295625,
}
export function convertMetricValue(
    metricId: string,
    value: number,
    fromUnit: string,
    toUnit: string,
) {
    const definition = metricDefinition(metricId)
    if (!definition) throw new Error(`Unknown metric: ${metricId}`)
    if (!definition.displayUnits.includes(fromUnit) || !definition.displayUnits.includes(toUnit))
        throw new Error(`Unsupported conversion for ${metricId}: ${fromUnit} to ${toUnit}`)
    return fromUnit === toUnit ? value : (value * factors[fromUnit]) / factors[toUnit]
}
export const preferencesForPreset = (preset: 'metric' | 'imperial'): MetricPreferences =>
    Object.fromEntries(
        metricCatalog.map(metric => [
            metric.id,
            { displayUnit: preset === 'metric' ? metric.metricUnit : metric.imperialUnit },
        ]),
    )
export function normalizedMetricPreferences(
    preferences?: MetricPreferences,
    legacyUnits: 'metric' | 'imperial' = 'metric',
) {
    const defaults = preferencesForPreset(legacyUnits)
    return Object.fromEntries(
        metricCatalog.map(metric => {
            const selected = preferences?.[metric.id]
            return [
                metric.id,
                selected && metric.displayUnits.includes(selected.displayUnit)
                    ? selected
                    : defaults[metric.id],
            ]
        }),
    )
}
export function detectUnitPreset(preferences?: MetricPreferences): UnitPreset {
    const normalized = normalizedMetricPreferences(preferences)
    const matches = (preset: 'metric' | 'imperial') =>
        metricCatalog.every(
            metric =>
                normalized[metric.id].displayUnit ===
                (preset === 'metric' ? metric.metricUnit : metric.imperialUnit),
        )
    return matches('metric') ? 'metric' : matches('imperial') ? 'imperial' : 'custom'
}
export function displayUnitFor(
    metricId: string,
    preferences?: MetricPreferences,
    legacyUnits: 'metric' | 'imperial' = 'metric',
) {
    return (
        normalizedMetricPreferences(preferences, legacyUnits)[metricId]?.displayUnit ??
        metricDefinition(metricId)?.canonicalUnit ??
        ''
    )
}
export function formatMetric(
    metricId: string,
    canonicalValue: number,
    preferences?: MetricPreferences,
    locale?: string,
    options?: { withUnit?: boolean; signed?: boolean },
) {
    const definition = metricDefinition(metricId)
    if (!definition) return canonicalValue.toLocaleString(locale)
    const unit = displayUnitFor(metricId, preferences)
    const value = convertMetricValue(metricId, canonicalValue, definition.canonicalUnit, unit)
    return formatMetricDisplayValue(metricId, value, unit, preferences, locale, options)
}
export function formatMetricDisplayValue(
    metricId: string,
    value: number,
    displayUnit: string,
    preferences?: MetricPreferences,
    locale?: string,
    options?: { withUnit?: boolean; signed?: boolean },
) {
    const definition = metricDefinition(metricId)
    if (!definition) return value.toLocaleString(locale)
    if (metricId === 'sleep') {
        const minutes = Math.round(Math.abs(value) * 60)
        const sign = options?.signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
        const hours = Math.floor(minutes / 60)
        return `${sign}${hours ? `${hours} h${minutes % 60 ? ' ' : ''}` : ''}${minutes % 60 ? `${minutes % 60} min` : hours ? '' : '0 min'}`
    }
    const precision = preferences?.[metricId]?.precision ?? definition.precision
    const sign = options?.signed && value > 0 ? '+' : ''
    const formatted = value.toLocaleString(locale, {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
    })
    if (options?.withUnit === false) return `${sign}${formatted}`
    const label = unitPresentation(displayUnit).label
    return `${sign}${formatted}${label === '/10' ? label : ` ${label}`}`
}
export function toCanonicalMetricValue(metricId: string, value: number, displayUnit: string) {
    const definition = metricDefinition(metricId)
    if (!definition) throw new Error(`Unknown metric: ${metricId}`)
    return convertMetricValue(metricId, value, displayUnit, definition.canonicalUnit)
}
