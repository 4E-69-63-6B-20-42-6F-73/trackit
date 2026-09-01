import { readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

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

const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const domainEntries = await readdir('src/domain', { withFileTypes: true })
const shims = []
for (const entry of domainEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue
    const path = join('src/domain', entry.name)
    const content = (await readFile(path, 'utf8')).trim()
    const match = content.match(/^export \* from '(@trackit\/domain\/[^']+)'$/)
    if (!match) continue
    shims.push({ path, name: entry.name.slice(0, -3), target: match[1] })
}

const sourceFiles = []
const collect = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await collect(path)
        else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(path)
    }
}
for (const directory of ['src', 'server', 'tests']) await collect(directory)

for (const path of sourceFiles) {
    if (shims.some(shim => shim.path === path)) continue
    let content = await readFile(path, 'utf8')
    const original = content
    for (const shim of shims) {
        const name = escapePattern(shim.name)
        content = content.replace(
            new RegExp(`(['"])(?:\\.\\.\\/)+(?:src\\/)?domain\\/${name}(?:\\.js)?\\1`, 'g'),
            `'${shim.target}'`,
        )
        if (path.startsWith('src/domain/'))
            content = content.replace(
                new RegExp(`(['"])\\.\\/${name}(?:\\.js)?\\1`, 'g'),
                `'${shim.target}'`,
            )
    }
    if (content !== original) await writeFile(path, content)
}

for (const shim of shims) await unlink(shim.path)

const workflowPath = '.github/workflows/auto-format.yml'
let workflow = await readFile(workflowPath, 'utf8')
workflow = workflow.replace('            - run: node scripts/stabilize-domain-schema.mjs\n', '')
await writeFile(workflowPath, workflow)
await unlink('scripts/stabilize-domain-schema.mjs')
