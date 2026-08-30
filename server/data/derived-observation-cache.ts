import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { derivedObservationInputs, derivedObservations } from '../db/schema.js'
import { deriveMetrics } from '../../src/domain/effectiveMetrics.js'
import type { NumericObservation } from '../../src/domain/health.js'

type Database = PostgresJsDatabase<typeof schemaType>
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export const DERIVED_OBSERVATION_CACHE_VERSION = 1

const inputIds = (observation: NumericObservation) => {
    const value = observation.metadata?.inputRecordIds
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

/** Replaces one local day's rebuildable derived observations and their lineage. */
export async function replaceDerivedObservationCache(
    database: Transaction,
    options: {
        userId: string
        date: string
        timezone: string
        resolutionVersion: number
        inputs: NumericObservation[]
    },
) {
    const derived = deriveMetrics(options.inputs, options.timezone)
    await database
        .delete(derivedObservations)
        .where(
            and(
                eq(derivedObservations.userId, options.userId),
                eq(derivedObservations.date, options.date),
            ),
        )

    const inputsById = new Map(options.inputs.map(input => [input.id, input]))
    for (const observation of derived) {
        const lineage = inputIds(observation)
        const fingerprint = lineage
            .map(id => `${id}:${inputsById.get(id)?.version ?? 0}`)
            .sort()
            .join('|')
        await database.insert(derivedObservations).values({
            id: observation.id,
            userId: options.userId,
            date: options.date,
            definitionId: observation.definitionId,
            canonicalValue: observation.canonicalValue,
            canonicalUnit: observation.canonicalUnit,
            observedAt: new Date(observation.observedAt),
            endedAt: observation.endedAt ? new Date(observation.endedAt) : null,
            derivation: observation.definitionId,
            derivationVersion: DERIVED_OBSERVATION_CACHE_VERSION,
            resolutionVersion: options.resolutionVersion,
            timezone: options.timezone,
            inputFingerprint: fingerprint,
        })
        if (lineage.length)
            await database.insert(derivedObservationInputs).values(
                lineage.map((id, ordinal) => ({
                    derivedObservationId: observation.id,
                    inputObservationId: id,
                    inputVersion: inputsById.get(id)?.version ?? 0,
                    ordinal,
                })),
            )
    }
    return derived
}
