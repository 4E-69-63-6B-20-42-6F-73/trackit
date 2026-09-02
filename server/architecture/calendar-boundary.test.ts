import { existsSync, readdirSync, readFileSync } from 'node:fs'
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

    it('requires server code to import the shared calendar directly', () => {
        const root = join(process.cwd(), 'server')
        const compatibilityPath = join(root, 'data', 'timezone.ts')
        const violations = sourceFiles(root).flatMap(path => {
            const source = readFileSync(path, 'utf8')
            return /from\s+['"][^'"]*timezone\.js['"]/.test(source)
                ? [relative(process.cwd(), path)]
                : []
        })

        expect(existsSync(compatibilityPath), 'The server timezone facade must stay deleted.').toBe(
            false,
        )
        expect(
            violations,
            'Server calendar consumers must import @trackit/domain/calendar directly.',
        ).toEqual([])
    })
})
