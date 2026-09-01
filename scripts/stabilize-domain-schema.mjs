import { readFile, writeFile } from 'node:fs/promises'

const schemaPath = 'server/db/schema.ts'
let schema = await readFile(schemaPath, 'utf8')
schema = schema.replace(
    "definitionId: text('definition_id').notNull(),\n    aggregation:",
    "definitionId: text('metric').notNull(),\n    aggregation:",
)
schema = schema.replace(
    "definitionId: text('definition_id').notNull(),\n    comparisonDefinitionId: text('comparison_definition_id'),",
    "definitionId: text('metric').notNull(),\n    comparisonDefinitionId: text('comparison_metric'),",
)
await writeFile(schemaPath, schema)

const deviceServicePath = 'server/devices/service.ts'
let deviceService = await readFile(deviceServicePath, 'utf8')
deviceService = deviceService.replace(
    /\n\s*\/\* Legacy journal persistence retired; Journal is projected from the graph\.[\s\S]*?\*\/\n/,
    '\n',
)
await writeFile(deviceServicePath, deviceService)
