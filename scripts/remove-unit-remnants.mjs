import { readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const read = path => readFile(path, 'utf8')
const write = (path, content) => writeFile(path, content)

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

{
    const path = 'src/components/GoalsPanel.tsx'
    const content = await read(path)
    const before = `        const unit = displayUnitFor(
            goal.definitionId,
            preferences?.metricPreferences,
            preferences?.units,
        )`
    const after = `        const unit = displayUnitFor(goal.definitionId, preferences?.metricPreferences)`
    if (!content.includes(before)) throw new Error('Missing GoalsPanel legacy unit call')
    await write(path, content.replace(before, after))
}

{
    const path = 'src/pages/Metrics.tsx'
    const content = await read(path)
    const before = "normalizedMetricPreferences(preferences?.metricPreferences, 'metric')"
    const after = 'normalizedMetricPreferences(preferences?.metricPreferences)'
    if (!content.includes(before)) throw new Error('Missing Metrics legacy unit call')
    await write(path, content.replace(before, after))
}

let removedFixtureFields = 0
for (const root of ['src', 'tests']) {
    for (const path of await walk(root)) {
        if (!/\.(?:ts|tsx)$/.test(path)) continue
        const content = await read(path)
        const matches = content.match(/^\s*units: '(?:metric|imperial)',\n/gm) ?? []
        if (!matches.length) continue
        removedFixtureFields += matches.length
        await write(path, content.replace(/^\s*units: '(?:metric|imperial)',\n/gm, ''))
    }
}
if (!removedFixtureFields) throw new Error('No legacy unit fixture fields found')

{
    const path = '.github/workflows/auto-format.yml'
    const content = await read(path)
    const step = '            - name: Remove unit compatibility remnants\n              run: node scripts/remove-unit-remnants.mjs\n'
    if (!content.includes(step)) throw new Error('Missing temporary workflow step')
    await write(path, content.replace(step, ''))
}

await unlink('scripts/remove-unit-remnants.mjs')
