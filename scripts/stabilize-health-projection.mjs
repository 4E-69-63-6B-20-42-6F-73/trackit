import fs from 'node:fs'

const servicePath = 'server/devices/service.ts'
const maintenancePath = 'server/health-records/maintenance.ts'
const projectionPath = 'server/health-records/projection.ts'
const workflowPath = '.github/workflows/auto-format.yml'

const replaceRequired = (source, search, replacement, label) => {
    if (!source.includes(search)) throw new Error(`Missing ${label}`)
    return source.replace(search, replacement)
}

const removeBlock = (source, startMarker, endMarker, label) => {
    const start = source.indexOf(startMarker)
    if (start < 0) throw new Error(`Missing ${label} start`)
    const end = source.indexOf(endMarker, start)
    if (end < 0) throw new Error(`Missing ${label} end`)
    return source.slice(0, start) + source.slice(end)
}

const projection = `import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
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
                      externalId: \`${'${record.externalId}'}:${'${projection.definitionId}'}:v${'${projection.derivationVersion}'}\`,
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
                sourceLabel: record.dataOrigin ? \`${'${connector}'} · ${'${record.dataOrigin}'}\` : connector,
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
`
fs.writeFileSync(projectionPath, projection)

let service = fs.readFileSync(servicePath, 'utf8')
service = replaceRequired(service, '    observationRelations,\n', '', 'service relation import')
service = replaceRequired(service, "import { deriveRecord } from '../health-records/derive.js'\n", '', 'service derive import')
service = replaceRequired(service, "import { projectHealthRecordToJournal } from '../health-records/journal.js'\n", '', 'service journal import')
service = replaceRequired(
    service,
    "import type { CanonicalHealthRecord, CanonicalHealthRecordInput } from '../health-records/types.js'\n",
    "import { insertHealthObservationGraph } from '../health-records/projection.js'\nimport type { CanonicalHealthRecordInput } from '../health-records/types.js'\n",
    'service projection import',
)
service = removeBlock(
    service,
    'async function insertHealthObservationGraph(',
    'export type DeviceUploadRecord = {',
    'service projection function',
)
fs.writeFileSync(servicePath, service)

let maintenance = fs.readFileSync(maintenancePath, 'utf8')
maintenance = replaceRequired(
    maintenance,
    'import { healthRecords, observationRelations, observations, preferences } from \'../db/schema.js\'\n',
    'import { healthRecords, observations, preferences } from \'../db/schema.js\'\n',
    'maintenance relation import',
)
maintenance = replaceRequired(maintenance, "import { deriveRecord } from './derive.js'\n", '', 'maintenance derive import')
maintenance = replaceRequired(maintenance, "import { projectHealthRecordToJournal } from './journal.js'\n", '', 'maintenance journal import')
maintenance = replaceRequired(
    maintenance,
    "import { normalizeHealthRecord } from './normalize.js'\n",
    "import { normalizeHealthRecord } from './normalize.js'\nimport { insertHealthObservationGraph } from './projection.js'\n",
    'maintenance projection import',
)
maintenance = replaceRequired(maintenance, "import type { CanonicalHealthRecord } from './types.js'\n", '', 'maintenance record type import')
maintenance = removeBlock(
    maintenance,
    'const connectorLabel = (connector?: string) => {',
    'export class ProviderRecordMaintenanceService {',
    'maintenance projection function',
)
maintenance = replaceRequired(
    maintenance,
    '                        const result = await insertObservationGraph(transaction, record)\n                        canonicalObservations += result.observationCount\n                        for (const projection of result.derived) {',
    '                        const projections = await insertHealthObservationGraph(transaction, record)\n                        canonicalObservations += projections.length + 1\n                        for (const projection of projections) {',
    'maintenance projection call',
)
fs.writeFileSync(maintenancePath, maintenance)

let workflow = fs.readFileSync(workflowPath, 'utf8')
workflow = replaceRequired(
    workflow,
    '            - name: Stabilize health projection\n              run: node scripts/stabilize-health-projection.mjs\n',
    '',
    'temporary workflow hook',
)
fs.writeFileSync(workflowPath, workflow)
fs.rmSync(new URL(import.meta.url))
