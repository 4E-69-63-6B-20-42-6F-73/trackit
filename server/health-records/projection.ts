import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { observationRelations, observations } from '../db/schema.js'
import { deriveRecord } from './derive.js'
import { projectHealthRecordToJournal } from './journal.js'
import { normalizeHealthRecord } from './normalize.js'
import type { CanonicalHealthRecord } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const connectorLabel = (connector?: string) => {
    if (!connector || connector === 'health_connect') return 'Health Connect'
    return connector
}

export async function insertHealthObservationGraph(
    transaction: Transaction,
    input: CanonicalHealthRecord,
) {
    const record = normalizeHealthRecord(input)
    const connector = connectorLabel(record.connector)
    const projections = deriveRecord(record)
    const components = projections.length
        ? await transaction
              .insert(observations)
              .values(
                  projections.map(projection => ({
                      userId: record.userId,
                      definitionId: projection.definitionId,
                      valueType: 'number' as const,
                      origin: 'external' as const,
                      canonicalValue: projection.value,
                      canonicalUnit: projection.unit,
                      originalValue: projection.originalValue ?? projection.value,
                      originalUnit: projection.originalUnit ?? projection.unit,
                      observedAt: projection.observedAt!,
                      endedAt: projection.endedAt,
                      externalId: `${record.externalId}:${projection.definitionId}:v${projection.derivationVersion}`,
                      kind: projection.kind,
                      sourceRecordId: record.id,
                      derivation: projection.derivation,
                      derivationVersion: projection.derivationVersion,
                      version: record.externalVersion,
                      metadata: {
                          source: connector,
                          dataOrigin: record.dataOrigin,
                          connector,
                          provider: record.provider,
                      },
                  })),
              )
              .returning({ id: observations.id, definitionId: observations.definitionId })
        : []

    const journal = projectHealthRecordToJournal(record, projections)
    const observedAt =
        record.recordType === 'SleepSessionRecord' && record.endTime
            ? record.endTime
            : record.startTime
    const [root] = await transaction
        .insert(observations)
        .values({
            id: record.id,
            userId: record.userId,
            definitionId: 'health_record',
            valueType: 'compound',
            origin: 'external',
            title: journal?.title,
            category: journal?.category,
            observedAt,
            endedAt: record.endTime,
            sourceRecordId: record.id,
            externalId: record.externalId,
            attributes: {
                description: journal?.detail ?? '',
                primaryDefinitionId: projections[0]?.definitionId,
                sourceLabel: record.dataOrigin ? `${connector} · ${record.dataOrigin}` : connector,
                recordType: record.recordType,
            },
            metadata: {
                connector,
                provider: record.provider,
                dataOrigin: record.dataOrigin,
            },
            version: record.externalVersion,
        })
        .returning({ id: observations.id })

    if (root && components.length)
        await transaction.insert(observationRelations).values(
            components.map((component, ordinal) => ({
                parentObservationId: root.id,
                childObservationId: component.id,
                kind: 'component',
                role: component.definitionId,
                ordinal,
            })),
        )

    return projections
}
