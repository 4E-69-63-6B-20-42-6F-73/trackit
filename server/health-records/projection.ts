import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { observationRelations, observations } from '../db/schema.js'
import { deriveRecord } from './derive.js'
import { projectHealthRecordToJournal } from './journal.js'
import { normalizeHealthRecord } from './normalize.js'
import type { CanonicalHealthRecord } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
const INSERT_CHUNK_SIZE = 500

const connectorLabel = (connector?: string) => {
    if (!connector || connector === 'health_connect') return 'Health Connect'
    return connector
}

const chunks = <T>(items: T[], size = INSERT_CHUNK_SIZE) => {
    const result: T[][] = []
    for (let index = 0; index < items.length; index += size)
        result.push(items.slice(index, index + size))
    return result
}

export async function insertHealthObservationGraphs(
    transaction: Transaction,
    inputs: CanonicalHealthRecord[],
) {
    if (!inputs.length) return []

    const prepared = inputs.map(input => {
        const record = normalizeHealthRecord(input)
        const connector = connectorLabel(record.connector)
        const projections = deriveRecord(record)
        const journal = projectHealthRecordToJournal(record, projections)
        const observedAt =
            record.recordType === 'SleepSessionRecord' && record.endTime
                ? record.endTime
                : record.startTime
        return { record, connector, projections, journal, observedAt }
    })

    const componentEntries = prepared.flatMap(item =>
        item.projections.map((projection, ordinal) => {
            const externalId = `${item.record.externalId}:${projection.definitionId}:v${projection.derivationVersion}`
            return {
                externalId,
                parentObservationId: item.record.id,
                role: projection.definitionId,
                ordinal,
                value: {
                    userId: item.record.userId,
                    definitionId: projection.definitionId,
                    valueType: 'number' as const,
                    origin: 'external' as const,
                    canonicalValue: projection.value,
                    canonicalUnit: projection.unit,
                    originalValue: projection.originalValue ?? projection.value,
                    originalUnit: projection.originalUnit ?? projection.unit,
                    observedAt: projection.observedAt!,
                    endedAt: projection.endedAt,
                    externalId,
                    kind: projection.kind,
                    sourceRecordId: item.record.id,
                    derivation: projection.derivation,
                    derivationVersion: projection.derivationVersion,
                    version: item.record.externalVersion,
                    metadata: {
                        source: item.connector,
                        dataOrigin: item.record.dataOrigin,
                        connector: item.connector,
                        provider: item.record.provider,
                    },
                },
            }
        }),
    )

    const componentIds = new Map<string, string>()
    for (const batch of chunks(componentEntries)) {
        const inserted = await transaction
            .insert(observations)
            .values(batch.map(item => item.value))
            .returning({ id: observations.id, externalId: observations.externalId })
        for (const item of inserted) if (item.externalId) componentIds.set(item.externalId, item.id)
    }

    const rootValues = prepared.map(item => ({
        id: item.record.id,
        userId: item.record.userId,
        definitionId: 'health_record',
        valueType: 'compound' as const,
        origin: 'external' as const,
        title: item.journal?.title,
        category: item.journal?.category,
        observedAt: item.observedAt,
        endedAt: item.record.endTime,
        sourceRecordId: item.record.id,
        externalId: item.record.externalId,
        attributes: {
            description: item.journal?.detail ?? '',
            primaryDefinitionId: item.projections[0]?.definitionId,
            sourceLabel: item.record.dataOrigin
                ? `${item.connector} · ${item.record.dataOrigin}`
                : item.connector,
            recordType: item.record.recordType,
        },
        metadata: {
            connector: item.connector,
            provider: item.record.provider,
            dataOrigin: item.record.dataOrigin,
        },
        version: item.record.externalVersion,
    }))

    for (const batch of chunks(rootValues)) await transaction.insert(observations).values(batch)

    const relationValues = componentEntries.map(item => ({
        parentObservationId: item.parentObservationId,
        childObservationId: componentIds.get(item.externalId)!,
        kind: 'component',
        role: item.role,
        ordinal: item.ordinal,
    }))
    for (const batch of chunks(relationValues))
        if (batch.length) await transaction.insert(observationRelations).values(batch)

    return prepared.map(item => ({
        recordId: item.record.id,
        projections: item.projections,
    }))
}

export async function insertHealthObservationGraph(
    transaction: Transaction,
    input: CanonicalHealthRecord,
) {
    const [result] = await insertHealthObservationGraphs(transaction, [input])
    return result?.projections ?? []
}
