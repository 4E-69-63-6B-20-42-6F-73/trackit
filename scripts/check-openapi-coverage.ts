import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openApiContract } from '../server/openapi.js'

const root = fileURLToPath(new URL('../server', import.meta.url))
const routePattern =
    /\b(?:app|routes)\.(get|post|put|patch|delete|options|head)(?:<[^>]*>)?\(\s*['"](\/api\/[^'"]+|\/mcp)['"]/g

const sourceFiles = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = await Promise.all(
        entries.map(async entry => {
            const path = join(directory, entry.name)
            if (entry.isDirectory()) return sourceFiles(path)
            if (
                entry.isFile() &&
                extname(entry.name) === '.ts' &&
                !entry.name.endsWith('.test.ts') &&
                !entry.name.endsWith('.spec.ts')
            )
                return [path]
            return []
        }),
    )
    return files.flat()
}

const normalizePath = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
const documented = openApiContract.paths as Record<string, Record<string, unknown>>
const missing: string[] = []

for (const file of await sourceFiles(root)) {
    const source = await readFile(file, 'utf8')
    for (const match of source.matchAll(routePattern)) {
        const method = match[1]
        const rawPath = match[2]
        const path = normalizePath(rawPath)
        if (!documented[path] || !documented[path][method]) {
            missing.push(`${method.toUpperCase()} ${rawPath} (${relative(root, file)})`)
        }
    }
}

if (missing.length) {
    throw new Error(`OpenAPI coverage is missing server routes:\n${missing.sort().join('\n')}`)
}
