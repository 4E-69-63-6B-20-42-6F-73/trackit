export type ObservationOrigin = 'manual' | 'external' | 'derived' | 'migration'
export type ObservationValueType = 'number' | 'text' | 'boolean' | 'category' | 'compound' | 'event'

export type ObservationRelationKind = 'component' | 'derived_from' | 'corrects' | 'supersedes'

export type ObservationValue =
    | { type: 'number'; value: number; unit: string; originalValue: number; originalUnit: string }
    | { type: 'text'; value: string }
    | { type: 'boolean'; value: boolean }
    | { type: 'category'; value: string }
    | { type: 'compound' }
    | { type: 'event' }

export type DomainObservation = {
    id: string
    definitionId: string
    definitionVersion: number
    value: ObservationValue
    origin: ObservationOrigin
    excluded: boolean
    title?: string | null
    category?: string | null
    observedAt: string
    endedAt?: string | null
    recordedAt: string
    sourceId?: string | null
    sourceRecordId?: string | null
    externalId?: string | null
    attributes: Record<string, unknown>
    metadata: Record<string, unknown>
    version: number
    deletedAt?: string | null
}

export type ObservationRelation = {
    parentObservationId: string
    childObservationId: string
    kind: ObservationRelationKind
    role: string
    ordinal: number
}

export const isNumericObservation = (
    observation: DomainObservation,
): observation is DomainObservation & { value: Extract<ObservationValue, { type: 'number' }> } =>
    observation.value.type === 'number'
