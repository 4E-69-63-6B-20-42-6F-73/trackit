import { readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const read = path => readFile(path, 'utf8')
const write = (path, content) => writeFile(path, content)

async function replaceExact(path, before, after) {
    const content = await read(path)
    if (!content.includes(before)) throw new Error(`Missing expected content in ${path}`)
    await write(path, content.replace(before, after))
}

async function replaceRegex(path, pattern, replacement) {
    const content = await read(path)
    if (!pattern.test(content)) throw new Error(`Missing expected pattern in ${path}`)
    pattern.lastIndex = 0
    await write(path, content.replace(pattern, replacement))
}

async function walk(path) {
    const entries = await readdir(path, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
        const child = join(path, entry.name)
        if (entry.isDirectory()) files.push(...(await walk(child)))
        else files.push(child)
    }
    return files
}

await replaceExact(
    'server/app.ts',
    "import type { DeviceService, DeviceUploadRecord } from './devices/service.js'",
    "import type { DeviceService } from './devices/service.js'",
)
await replaceExact('server/app.ts', "        '/api/device/upload',\n", '')
await replaceRegex(
    'server/app.ts',
    /\n        const uploadRecordSchema = z\.object\(\{[\s\S]*?\n        \}\)\n(?=        const healthRecordSchema)/,
    '',
)
await replaceRegex(
    'server/app.ts',
    /\n        app\.post\('\/api\/device\/upload',[\s\S]*?\n        \}\)\n(?=        app\.post\('\/api\/device\/health-records')/,
    '',
)

await replaceRegex(
    'server/devices/service.ts',
    /\nexport type DeviceUploadRecord = \{[\s\S]*?\n\}\n(?=\nexport type DeviceAuthenticationFailure)/,
    '',
)
await replaceRegex(
    'server/devices/service.ts',
    /\n    async upload\(deviceId: string, idempotencyKey: string, records: DeviceUploadRecord\[\]\) \{[\s\S]*?\n    \}\n(?=\n    async uploadHealthRecords\()/,
    '',
)

await replaceExact(
    'server/devices/service.test.ts',
    "describe('Android device pairing and upload', () => {",
    "describe('Android device pairing and canonical upload', () => {",
)
await replaceRegex(
    'server/devices/service.test.ts',
    /\n        const batch = randomUUID\(\)[\s\S]*?\n        const sourceId = 'canonical-heart-rate'/,
    "\n        const sourceId = 'canonical-heart-rate'",
)
{
    const path = 'server/devices/service.test.ts'
    const content = await read(path)
    await write(path, content.replaceAll('/api/device/upload', '/api/device/health-records'))
}

await replaceExact(
    'docs/HEALTH_CONNECT_ARCHITECTURE.md',
    '- Legacy `/api/device/upload` ingestion remains a versioned compatibility path for older companion builds. It writes definition-backed observations with a canonical `source_id`; current Android builds use `/api/device/health-records`, which preserves source records before derivation.\n',
    '- Android ingestion uses `/api/device/health-records`, which preserves canonical source records before deterministic observation derivation.\n',
)
await replaceExact(
    'docs/HEALTH_CONNECT_ARCHITECTURE.md',
    'It does not alter legacy or manually entered observations.',
    'It does not alter manually entered observations.',
)

await replaceExact(
    'src/lib/preferencesApi.ts',
    "import { preferencesForPreset, type MetricPreferences } from '@trackit/domain/metrics'",
    "import type { MetricPreferences } from '@trackit/domain/metrics'",
)
await replaceExact('src/lib/preferencesApi.ts', "    units: 'metric' | 'imperial'\n", '')
await replaceRegex(
    'src/lib/preferencesApi.ts',
    /export async function getPreferences\(signal\?: AbortSignal\): Promise<Preferences> \{[\s\S]*?\n\}\n(?=\nexport async function updatePreferences)/,
    `export async function getPreferences(signal?: AbortSignal): Promise<Preferences> {
    const response = await authRequest('/api/preferences', { signal })
    if (!response.ok) throw new Error('Preferences unavailable')
    return ((await response.json()) as { data: Preferences }).data
}`,
)

await replaceRegex(
    'packages/domain/src/metrics.ts',
    /export function normalizedMetricPreferences\(\n    preferences\?: MetricPreferences,\n    legacyUnits: 'metric' \| 'imperial' = 'metric',\n\) \{\n    const defaults = preferencesForPreset\(legacyUnits\)/,
    `export function normalizedMetricPreferences(preferences?: MetricPreferences) {
    const defaults = preferencesForPreset('metric')`,
)
await replaceRegex(
    'packages/domain/src/metrics.ts',
    /export function displayUnitFor\(\n    metricId: string,\n    preferences\?: MetricPreferences,\n    legacyUnits: 'metric' \| 'imperial' = 'metric',\n\) \{\n    return \(\n        normalizedMetricPreferences\(preferences, legacyUnits\)/,
    `export function displayUnitFor(metricId: string, preferences?: MetricPreferences) {
    return (
        normalizedMetricPreferences(preferences)`,
)

for (const path of [
    'src/pages/Trends.tsx',
    'src/components/GoalsPanel.tsx',
    'src/components/logging/ManualEntryLogger.tsx',
]) {
    const content = await read(path)
    const next = content.replace(/,\s*preferences\?\.units(?=\s*\))/g, '')
    if (next === content) throw new Error(`No legacy unit fallback found in ${path}`)
    await write(path, next)
}

for (const root of ['src', 'tests']) {
    for (const path of await walk(root)) {
        if (!/\.(?:ts|tsx)$/.test(path)) continue
        const content = await read(path)
        const next = content.replace(
            /\n(\s*)units: '(?:metric|imperial)',(?=\n\1metricPreferences:)/g,
            '',
        )
        if (next !== content) await write(path, next)
    }
}

await replaceExact(
    'src/domain/metrics.test.ts',
    `    it('migrates legacy imperial preferences when per-metric values are absent', () => {
        expect(normalizedMetricPreferences(undefined, 'imperial').weight.displayUnit).toBe('lb')
        expect(normalizedMetricPreferences(undefined, 'imperial').steps.displayUnit).toBe('count')
    })`,
    `    it('uses metric defaults when per-metric values are absent', () => {
        expect(normalizedMetricPreferences(undefined).weight.displayUnit).toBe('kg')
        expect(normalizedMetricPreferences(undefined).steps.displayUnit).toBe('count')
    })`,
)

await replaceExact('server/data/postgres-repository.ts', "        units?: 'metric' | 'imperial'\n", '')

{
    const path = 'src/App.tsx'
    let content = await read(path)
    const patterns = [
        /\n                            <Route path="\/nutrition" element=\{<Navigate to="\/library" replace \/>\} \/>/,
        /\n                            <Route\n                                path="\/metrics"\n                                element=\{<Navigate to="\/library\/metrics" replace \/>\}\n                            \/>/,
        /\n                            <Route\n                                path="\/connections"\n                                element=\{<Navigate to="\/settings\/connections" replace \/>\}\n                            \/>/,
        /\n                            <Route\n                                path="\/connections\/devices"\n                                element=\{<Navigate to="\/settings\/connections\/devices" replace \/>\}\n                            \/>/,
        /\n                            <Route\n                                path="\/connections\/devices\/new"\n                                element=\{\n                                    <Navigate to="\/settings\/connections\/devices\/new" replace \/>\n                                \}\n                            \/>/,
        /\n                            <Route\n                                path="\/connections\/mcp"\n                                element=\{<Navigate to="\/settings\/connections\/mcp" replace \/>\}\n                            \/>/,
        /\n                            <Route\n                                path="\/connections\/mcp\/new"\n                                element=\{<Navigate to="\/settings\/connections\/mcp\/new" replace \/>\}\n                            \/>/,
        /\n                            <Route\n                                path="\/settings\/goals"\n                                element=\{<Navigate to="\/goals" replace \/>\}\n                            \/>/,
    ]
    for (const pattern of patterns) {
        if (!pattern.test(content)) throw new Error(`Missing legacy redirect in ${path}`)
        content = content.replace(pattern, '')
    }
    await write(path, content)
}

{
    const path = 'server/db/schema.ts'
    let content = await read(path)
    if (!content.includes("    units: text('units').notNull().default('metric'),\n"))
        throw new Error('Missing preferences.units schema column')
    content = content.replace("    units: text('units').notNull().default('metric'),\n", '')
    content = content.replace(
        "    metricPreferences: jsonb('metric_preferences'),",
        "    metricPreferences: jsonb('metric_preferences').notNull().default({}),",
    )
    const goalMetricMatches = content.match(/definitionId: text\('metric'\)/g) ?? []
    if (goalMetricMatches.length !== 2)
        throw new Error(`Expected 2 physical metric columns, found ${goalMetricMatches.length}`)
    content = content.replaceAll("definitionId: text('metric')", "definitionId: text('definition_id')")
    content = content.replace(
        "comparisonDefinitionId: text('comparison_metric')",
        "comparisonDefinitionId: text('comparison_definition_id')",
    )
    await write(path, content)
}

await write(
    'server/db/migrations/0024_generated_schema_changes.sql',
    `UPDATE "observations" SET "excluded" = true WHERE "state" = 'excluded';--> statement-breakpoint
UPDATE "observations"
SET "deleted_at" = COALESCE("deleted_at", "updated_at")
WHERE "state" = 'deleted' AND "deleted_at" IS NULL;--> statement-breakpoint
UPDATE "preferences"
SET "metric_preferences" = CASE
    WHEN "units" = 'imperial' THEN '{"height":{"displayUnit":"in"},"weight":{"displayUnit":"lb"},"water":{"displayUnit":"fl oz"}}'::jsonb || COALESCE("metric_preferences", '{}'::jsonb)
    ELSE COALESCE("metric_preferences", '{}'::jsonb)
END;--> statement-breakpoint
ALTER TABLE "goals" RENAME COLUMN "metric" TO "definition_id";--> statement-breakpoint
ALTER TABLE "saved_trend_views" RENAME COLUMN "metric" TO "definition_id";--> statement-breakpoint
ALTER TABLE "saved_trend_views" RENAME COLUMN "comparison_metric" TO "comparison_definition_id";--> statement-breakpoint
ALTER TABLE "goals" DROP COLUMN "target_value";--> statement-breakpoint
ALTER TABLE "observations" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "preferences" ALTER COLUMN "metric_preferences" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "preferences" ALTER COLUMN "metric_preferences" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "goals";--> statement-breakpoint
ALTER TABLE "preferences" DROP COLUMN "units";
`,
)

{
    const path = 'server/db/migrations/meta/0024_snapshot.json'
    const snapshot = JSON.parse(await read(path))
    const renameColumn = (tableName, from, to) => {
        const columns = snapshot.tables[tableName]?.columns
        if (!columns?.[from]) throw new Error(`Missing ${tableName}.${from} in snapshot`)
        if (columns[to]) throw new Error(`Snapshot already contains ${tableName}.${to}`)
        const entries = Object.entries(columns)
        snapshot.tables[tableName].columns = Object.fromEntries(
            entries.map(([key, value]) => {
                if (key !== from) return [key, value]
                return [to, { ...value, name: to }]
            }),
        )
    }
    renameColumn('public.goals', 'metric', 'definition_id')
    renameColumn('public.saved_trend_views', 'metric', 'definition_id')
    renameColumn('public.saved_trend_views', 'comparison_metric', 'comparison_definition_id')
    const preferences = snapshot.tables['public.preferences']?.columns
    if (!preferences?.units) throw new Error('Missing public.preferences.units in snapshot')
    delete preferences.units
    if (!preferences.metric_preferences)
        throw new Error('Missing public.preferences.metric_preferences in snapshot')
    preferences.metric_preferences.notNull = true
    preferences.metric_preferences.default = "'{}'::jsonb"
    await write(path, `${JSON.stringify(snapshot, null, 4)}\n`)
}

{
    const path = '.github/workflows/auto-format.yml'
    let content = await read(path)
    const step = '            - name: Remove legacy compatibility\n              run: node scripts/remove-legacy-compat.mjs\n'
    if (!content.includes(step)) throw new Error('Missing temporary workflow step')
    content = content.replace(step, '')
    await write(path, content)
}

await unlink('scripts/remove-legacy-compat.mjs')
