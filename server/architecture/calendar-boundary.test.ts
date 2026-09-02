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

describe('calendar architecture', () => {
    it('keeps timezone conversion inside the shared domain calendar', () => {
        const root = join(process.cwd(), 'packages', 'domain', 'src')
        const violations = sourceFiles(root)
            .filter(path => !path.endsWith(join('src', 'calendar.ts')))
            .flatMap(path => {
                const source = readFileSync(path, 'utf8')
                const ownsTimezoneFormatter =
                    /new\s+Intl\.DateTimeFormat/.test(source) && /timeZone\s*:/.test(source)
                const ownsZonedParts = /\.formatToParts\s*\(/.test(source)
                return ownsTimezoneFormatter || ownsZonedParts
                    ? [relative(process.cwd(), path)]
                    : []
            })

        expect(
            violations,
            'Timezone-aware calendar conversion belongs in packages/domain/src/calendar.ts.',
        ).toEqual([])
    })

    it('keeps the legacy server timezone module as a zero-logic facade', () => {
        const path = join(process.cwd(), 'server', 'data', 'timezone.ts')
        const source = readFileSync(path, 'utf8')

        expect(source).toContain("from '@trackit/domain/calendar'")
        expect(source).not.toMatch(/Intl\.DateTimeFormat|Date\.UTC|setUTCDate|getUTCDate|formatToParts/)
    })
})
