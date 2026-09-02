import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { openApiContract } from '../server/openapi.js'

const root = fileURLToPath(new URL('../server', import.meta.url))
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head'])

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
const isApiPath = (path: string) => path.startsWith('/api/') || path === '/mcp'
const documented = openApiContract.paths as Record<string, Record<string, unknown>>
const discovered = new Map<string, Set<string>>()
const routeLocations = new Map<string, string>()

const addRoute = (method: string, rawPath: string, file: string) => {
    if (!httpMethods.has(method) || !isApiPath(rawPath)) return
    const path = normalizePath(rawPath)
    const methods = discovered.get(path) ?? new Set<string>()
    methods.add(method)
    discovered.set(path, methods)
    routeLocations.set(`${method} ${path}`, `${relative(root, file)} (${rawPath})`)
}

const stringValue = (node: ts.Node | undefined) =>
    node && ts.isStringLiteralLike(node) ? node.text : undefined

for (const file of await sourceFiles(root)) {
    const source = await readFile(file, 'utf8')
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text.toLowerCase()
            if (httpMethods.has(method)) {
                const rawPath = stringValue(node.arguments[0])
                if (rawPath) addRoute(method, rawPath, file)
            } else if (method === 'route') {
                const options = node.arguments[0]
                if (options && ts.isObjectLiteralExpression(options)) {
                    const urlProperty = options.properties.find(
                        property =>
                            ts.isPropertyAssignment(property) &&
                            stringValue(property.name) === 'url',
                    ) as ts.PropertyAssignment | undefined
                    const methodProperty = options.properties.find(
                        property =>
                            ts.isPropertyAssignment(property) &&
                            stringValue(property.name) === 'method',
                    ) as ts.PropertyAssignment | undefined
                    const rawPath = stringValue(urlProperty?.initializer)
                    if (rawPath && methodProperty) {
                        const initializer = methodProperty.initializer
                        if (ts.isArrayLiteralExpression(initializer)) {
                            for (const entry of initializer.elements) {
                                const value = stringValue(entry)?.toLowerCase()
                                if (value) addRoute(value, rawPath, file)
                            }
                        } else {
                            const value = stringValue(initializer)?.toLowerCase()
                            if (value) addRoute(value, rawPath, file)
                        }
                    }
                }
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
}

const missing: string[] = []
for (const [path, methods] of discovered) {
    for (const method of methods) {
        if (!documented[path] || !documented[path][method]) {
            const location = routeLocations.get(`${method} ${path}`) ?? 'unknown source'
            missing.push(`${method.toUpperCase()} ${path} (${location})`)
        }
    }
}

const orphaned: string[] = []
for (const [path, pathItem] of Object.entries(documented)) {
    for (const method of Object.keys(pathItem).filter(method => httpMethods.has(method))) {
        if (!discovered.get(path)?.has(method)) orphaned.push(`${method.toUpperCase()} ${path}`)
    }
}

if (missing.length || orphaned.length) {
    const sections = [
        missing.length
            ? `OpenAPI coverage is missing server routes:\n${missing.sort().join('\n')}`
            : '',
        orphaned.length
            ? `OpenAPI contains operations with no server route:\n${orphaned.sort().join('\n')}`
            : '',
    ].filter(Boolean)
    throw new Error(sections.join('\n\n'))
}
