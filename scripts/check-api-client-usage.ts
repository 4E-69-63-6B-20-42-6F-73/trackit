import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../src', import.meta.url))
const allowedRawTransport = new Set(['lib/apiClient.ts'])

const sourceFiles = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async entry => {
            const path = join(directory, entry.name)
            if (entry.isDirectory()) return sourceFiles(path)
            if (
                entry.isFile() &&
                ['.ts', '.tsx'].includes(extname(entry.name)) &&
                !entry.name.endsWith('.test.ts') &&
                !entry.name.endsWith('.test.tsx') &&
                !entry.name.endsWith('.spec.ts') &&
                !entry.name.endsWith('.spec.tsx') &&
                entry.name !== 'api.generated.ts'
            )
                return [path]
            return []
        }),
    )
    return files.flat()
}

const violations: string[] = []
for (const file of await sourceFiles(root)) {
    const source = await readFile(file, 'utf8')
    const name = relative(root, file).replaceAll('\\', '/')
    if (/\bauthRequest\s*\(/.test(source)) violations.push(`${name}: uses authRequest`)
    if (/from\s+['"][^'"]*sharedRequest['"]/.test(source))
        violations.push(`${name}: imports sharedRequest`)
    if (!allowedRawTransport.has(name) && /\bfetch\s*\(/.test(source) && /\/api\//.test(source))
        violations.push(`${name}: uses raw fetch for an API route`)
}

if (violations.length) {
    throw new Error(
        `First-party API calls must use src/lib/apiClient.ts and generated OpenAPI paths:\n${violations.sort().join('\n')}`,
    )
}
