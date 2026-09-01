import { metricCatalog, metricDefinition, type MetricDefinition } from './metricCatalog.js'
import type { ObservationValueType } from './observations.js'

export type ObservationDefinition = {
    id: string
    name: string
    valueType: ObservationValueType
    metric?: MetricDefinition
}

const semanticDefinitions: ObservationDefinition[] = [
    { id: 'meal', name: 'Meal', valueType: 'compound' },
    { id: 'note', name: 'Note', valueType: 'text' },
    { id: 'event', name: 'Event', valueType: 'event' },
    { id: 'check_in', name: 'Check-in', valueType: 'text' },
    { id: 'health_record', name: 'Imported health record', valueType: 'compound' },
]

export const observationDefinitions: ObservationDefinition[] = [
    ...metricCatalog.map(metric => ({
        id: metric.id,
        name: metric.name,
        valueType: 'number' as const,
        metric,
    })),
    ...semanticDefinitions,
]

const registry = new Map(observationDefinitions.map(definition => [definition.id, definition]))

export const observationDefinition = (definitionId: string | null) =>
    definitionId ? registry.get(definitionId) : undefined

export const measurableDefinition = (definitionId: string | null) => metricDefinition(definitionId)
