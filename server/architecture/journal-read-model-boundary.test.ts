import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceFiles = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return sourceFiles(path)
        return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')
            ? [path]
            : []
    })

describe('Journal read-model architecture', () => {
    it('does not read provider/source records directly', () => {
        const root = join(process.cwd(), 'server', 'journal')
        const violations = sourceFiles(root).flatMap(path => {
            const source = readFileSync(path, 'utf8')
            const reasons = [
                /\bhealthRecords\b/.test(source) ? 'references healthRecords storage' : null,
                /from\s+['"][^'"]*health-records[^'"]*['"]/.test(source)
                    ? 'imports provider-aware health-record modules'
                    : null,
                /from\s+['"][^'"]*devices[^'"]*['"]/.test(source)
                    ? 'imports connector/device ingestion modules'
                    : null,
            ].filter((reason): reason is string => Boolean(reason))
            return reasons.map(reason => `${relative(process.cwd(), path)}: ${reason}`)
        })

        expect(
            violations,
            'Journal must read normalized observation/projection data only. Provider-aware semantics belong at the ingestion/projection boundary.',
        ).toEqual([])
    })
})
