import { readFile, unlink, writeFile } from 'node:fs/promises'

const trendsPath = 'src/pages/Trends.tsx'
const trends = await readFile(trendsPath, 'utf8')
const before = `    const days = ranges[range]
    const observationFromKey = addCalendarDays(todayKey, -(days * 2 - 1))
    const observationRange = {
        from: calendarDayRangeForKey(observationFromKey, timezone).from.toISOString(),
        to: calendarDayRangeForKey(todayKey, timezone).to.toISOString(),
        definitionIds: activeDefinitionId
            ? [activeDefinitionId, ...(comparisonDefinitionId ? [comparisonDefinitionId] : [])]
            : [],
    }`
const after = `    const days = ranges[range]
    const observationFromKey = addCalendarDays(todayKey, -(days * 2 - 1))
    const observationDefinitionIds = activeDefinitionId
        ? [activeDefinitionId, ...(comparisonDefinitionId ? [comparisonDefinitionId] : [])]
        : []
    const observationStart = calendarDayRangeForKey(observationFromKey, timezone).from
    const sleepLookbehindMs = observationDefinitionIds.some(id => id.startsWith('sleep'))
        ? 36 * 60 * 60 * 1000
        : 0
    const observationRange = {
        from: new Date(observationStart.getTime() - sleepLookbehindMs).toISOString(),
        to: calendarDayRangeForKey(todayKey, timezone).to.toISOString(),
        definitionIds: observationDefinitionIds,
    }`
if (!trends.includes(before)) throw new Error('Missing expected Trends observation range')
await writeFile(trendsPath, trends.replace(before, after))

const workflowPath = '.github/workflows/auto-format.yml'
const workflow = await readFile(workflowPath, 'utf8')
const step = '            - name: Integrate upstream sleep fix\n              run: node scripts/integrate-main-sleep-fix.mjs\n'
if (!workflow.includes(step)) throw new Error('Missing temporary workflow step')
await writeFile(workflowPath, workflow.replace(step, ''))
await unlink('scripts/integrate-main-sleep-fix.mjs')
