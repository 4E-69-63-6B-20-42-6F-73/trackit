import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = fileURLToPath(new URL('../src', import.meta.url))
const androidRoot = fileURLToPath(
    new URL('../android/app/src/main/java/net/trackit/companion', import.meta.url),
)
const allowedRawTransport = new Set(['lib/apiClient.ts'])
const generatedAndroidClient = 'OpenApiEndpoints.generated.kt'

const sourceFiles = async (directory: string, extensions: string[]): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async entry => {
            const path = join(directory, entry.name)
            if (entry.isDirectory()) return sourceFiles(path, extensions)
            if (entry.isFile() && extensions.includes(extname(entry.name))) return [path]
            return []
        }),
    )
    return files.flat()
}

const violations: string[] = []
for (const file of await sourceFiles(webRoot, ['.ts', '.tsx'])) {
    const name = relative(webRoot, file).replaceAll('\\', '/')
    if (
        name.endsWith('.test.ts') ||
        name.endsWith('.test.tsx') ||
        name.endsWith('.spec.ts') ||
        name.endsWith('.spec.tsx') ||
        name === 'lib/api.generated.ts'
    )
        continue
    const source = await readFile(file, 'utf8')
    if (/\bauthRequest\s*\(/.test(source)) violations.push(`${name}: uses authRequest`)
    if (/from\s+['"][^'"]*sharedRequest['"]/.test(source))
        violations.push(`${name}: imports sharedRequest`)
    if (!allowedRawTransport.has(name) && /\bfetch\s*\(/.test(source) && /\/api\//.test(source))
        violations.push(`${name}: uses raw fetch for an API route`)
}

for (const file of await sourceFiles(androidRoot, ['.kt'])) {
    const name = relative(androidRoot, file).replaceAll('\\', '/')
    if (name === generatedAndroidClient) continue
    const source = await readFile(file, 'utf8')
    if (/"\/api\//.test(source))
        violations.push(`${name}: hard-codes an API route instead of using OpenApiEndpoints`)
}

if (violations.length) {
    throw new Error(
        `First-party API calls must use generated OpenAPI clients and endpoints:\n${violations.sort().join('\n')}`,
    )
}
