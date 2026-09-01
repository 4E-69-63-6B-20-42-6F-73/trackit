import { readFile, writeFile } from 'node:fs/promises'

const path = 'server/db/schema.ts'
let content = await readFile(path, 'utf8')
content = content.replace(
    "definitionId: text('definition_id').notNull(),\n    aggregation:",
    "definitionId: text('metric').notNull(),\n    aggregation:",
)
content = content.replace(
    "definitionId: text('definition_id').notNull(),\n    comparisonDefinitionId: text('comparison_definition_id'),",
    "definitionId: text('metric').notNull(),\n    comparisonDefinitionId: text('comparison_metric'),",
)
await writeFile(path, content)
