export type JsonObject = Record<string, unknown>

export type CanonicalHealthRecordInput = {
    provider: string
    recordType: string
    externalId: string
    externalVersion: number
    startTime: string
    endTime?: string
    dataOrigin?: string
    recordingMethod?: string
    device?: JsonObject
    payload: JsonObject
    lastModifiedTime?: string
    deleted?: boolean
}

export type CanonicalHealthRecord = Omit<CanonicalHealthRecordInput, 'startTime' | 'endTime'> & {
    id: string
    userId: string
    startTime: Date
    endTime: Date | null
}

export type DerivedObservation = {
    metric: string
    value: number
    unit: string
    observedAt?: Date
    endedAt?: Date | null
    kind: 'raw_metric' | 'derived_metric'
    derivation: string
    derivationVersion: number
}
