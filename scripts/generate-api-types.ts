import { readFile, writeFile } from 'node:fs/promises'
import { format } from 'prettier'
import { createApp } from '../server/app.js'
import type { DataRepository } from '../server/data/types.js'
import type { JournalRepository } from '../server/journal/types.js'

type JsonObject = Record<string, unknown>

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head'])

const journal: JournalRepository = {
    list: async () => [],
    ready: async () => true,
}

const asObject = (value: unknown): JsonObject | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as JsonObject)
        : undefined

const propertyKey = (value: string) =>
    /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value) || /^\d+$/.test(value) ? value : JSON.stringify(value)

const resolvePointer = (document: JsonObject, pointer: string): unknown => {
    if (!pointer.startsWith('#/')) return undefined
    let current: unknown = document
    for (const segment of pointer
        .slice(2)
        .split('/')
        .map(value => value.replaceAll('~1', '/').replaceAll('~0', '~'))) {
        current = asObject(current)?.[segment]
    }
    return current
}

const schemaType = (
    value: unknown,
    document: JsonObject,
    resolving = new Set<string>(),
): string => {
    if (value === true) return 'unknown'
    if (value === false) return 'never'
    const schema = asObject(value)
    if (!schema) return 'unknown'

    if (typeof schema.$ref === 'string') {
        if (resolving.has(schema.$ref)) return 'unknown'
        const resolved = resolvePointer(document, schema.$ref)
        const next = new Set(resolving)
        next.add(schema.$ref)
        return schemaType(resolved, document, next)
    }

    if ('const' in schema) return JSON.stringify(schema.const) ?? 'unknown'
    if (Array.isArray(schema.enum) && schema.enum.length)
        return schema.enum.map(item => JSON.stringify(item)).join(' | ')

    for (const key of ['oneOf', 'anyOf'] as const) {
        if (Array.isArray(schema[key]) && schema[key].length)
            return schema[key].map(item => schemaType(item, document, resolving)).join(' | ')
    }
    if (Array.isArray(schema.allOf) && schema.allOf.length)
        return schema.allOf.map(item => schemaType(item, document, resolving)).join(' & ')

    if (Array.isArray(schema.type))
        return schema.type
            .map(type => schemaType({ ...schema, type }, document, resolving))
            .join(' | ')

    let result: string
    if (schema.type === 'string') result = 'string'
    else if (schema.type === 'number' || schema.type === 'integer') result = 'number'
    else if (schema.type === 'boolean') result = 'boolean'
    else if (schema.type === 'null') result = 'null'
    else if (schema.type === 'array' || schema.items) {
        const item = schemaType(schema.items, document, resolving)
        result = `Array<${item}>`
    } else if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
        const properties = asObject(schema.properties) ?? {}
        const required = new Set(
            Array.isArray(schema.required)
                ? schema.required.filter((item): item is string => typeof item === 'string')
                : [],
        )
        const fields = Object.entries(properties)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(
                ([name, child]) =>
                    `${propertyKey(name)}${required.has(name) ? '' : '?'}: ${schemaType(child, document, resolving)}`,
            )
        if (schema.additionalProperties === true) fields.push('[key: string]: unknown')
        else if (asObject(schema.additionalProperties))
            fields.push(
                `[key: string]: ${schemaType(schema.additionalProperties, document, resolving)}`,
            )
        result = fields.length ? `{ ${fields.join('; ')} }` : 'Record<string, unknown>'
    } else result = 'unknown'

    return schema.nullable === true && result !== 'null' ? `${result} | null` : result
}

const resolveObject = (value: unknown, document: JsonObject): JsonObject | undefined => {
    const object = asObject(value)
    if (!object) return undefined
    if (typeof object.$ref !== 'string') return object
    return asObject(resolvePointer(document, object.$ref))
}

const parametersType = (
    pathItem: JsonObject,
    operation: JsonObject,
    document: JsonObject,
): string => {
    const entries = [
        ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
        ...(Array.isArray(operation.parameters) ? operation.parameters : []),
    ]
    const parameters = new Map<string, JsonObject>()
    for (const entry of entries) {
        const parameter = resolveObject(entry, document)
        if (!parameter || typeof parameter.name !== 'string' || typeof parameter.in !== 'string')
            continue
        parameters.set(`${parameter.in}:${parameter.name}`, parameter)
    }

    const groups = ['query', 'header', 'path', 'cookie'].map(location => {
        const values = [...parameters.values()]
            .filter(parameter => parameter.in === location)
            .sort((left, right) => String(left.name).localeCompare(String(right.name)))
        if (!values.length) return `${location}?: never`
        const requiredGroup = values.some(parameter => parameter.required === true)
        const fields = values.map(parameter => {
            const name = String(parameter.name)
            const type = schemaType(parameter.schema, document)
            return `${propertyKey(name)}${parameter.required === true ? '' : '?'}: ${type}`
        })
        return `${location}${requiredGroup ? '' : '?'}: { ${fields.join('; ')} }`
    })
    return `{ ${groups.join('; ')} }`
}

const requestBodyType = (operation: JsonObject, document: JsonObject): string => {
    const body = resolveObject(operation.requestBody, document)
    if (!body) return 'requestBody?: never'
    const content = asObject(body.content) ?? {}
    const entries = Object.entries(content)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([contentType, media]) => {
            const schema = asObject(media)?.schema
            return `${propertyKey(contentType)}: ${schemaType(schema, document)}`
        })
    const optional = body.required === true ? '' : '?'
    return `requestBody${optional}: { content: { ${entries.join('; ')} } }`
}

const responseType = (value: unknown, document: JsonObject): string => {
    const response = resolveObject(value, document)
    if (!response) return '{ headers: { [name: string]: unknown }; content?: never }'
    const content = asObject(response.content)
    if (!content || !Object.keys(content).length)
        return '{ headers: { [name: string]: unknown }; content?: never }'
    const entries = Object.entries(content)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([contentType, media]) => {
            const schema = asObject(media)?.schema
            return `${propertyKey(contentType)}: ${schemaType(schema, document)}`
        })
    return `{ headers: { [name: string]: unknown }; content: { ${entries.join('; ')} } }`
}

const responsesType = (operation: JsonObject, document: JsonObject): string => {
    const responses = asObject(operation.responses) ?? {}
    const entries = Object.entries(responses)
        .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
        .map(([status, response]) => `${propertyKey(status)}: ${responseType(response, document)}`)
    return `{ ${entries.join('; ')} }`
}

const operationType = (pathItem: JsonObject, operation: JsonObject, document: JsonObject): string =>
    `{ parameters: ${parametersType(pathItem, operation, document)}; ${requestBodyType(operation, document)}; responses: ${responsesType(operation, document)} }`

const renderPaths = (document: JsonObject): string => {
    const paths = asObject(document.paths)
    if (!paths) throw new Error('OpenAPI document has no paths')
    const entries = Object.entries(paths)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, rawPathItem]) => {
            const pathItem = asObject(rawPathItem)
            if (!pathItem) throw new Error(`OpenAPI path item is invalid: ${path}`)
            const operations = Object.entries(pathItem)
                .filter(([method, value]) => httpMethods.has(method) && asObject(value))
                .sort(([left], [right]) => left.localeCompare(right))
                .map(
                    ([method, value]) =>
                        `${method}: ${operationType(pathItem, asObject(value)!, document)}`,
                )
            if (!operations.length) throw new Error(`OpenAPI path has no operations: ${path}`)
            return `${propertyKey(path)}: { ${operations.join('; ')} }`
        })
    return `export interface paths { ${entries.join('; ')} }\n`
}

const target = new URL('../src/lib/api.generated.ts', import.meta.url)
const app = await createApp(journal, {
    dataRepository: {} as DataRepository,
})

try {
    await app.ready()
    const response = await app.inject({ method: 'GET', url: '/api/openapi.json' })
    if (response.statusCode !== 200)
        throw new Error(`OpenAPI generation failed (${response.statusCode})`)
    const document = response.json() as JsonObject
    const source = await format(renderPaths(document), {
        parser: 'typescript',
        printWidth: 100,
        tabWidth: 4,
        useTabs: false,
        semi: false,
        singleQuote: true,
        trailingComma: 'all',
        arrowParens: 'avoid',
    })
    if (process.argv.includes('--check')) {
        const current = await readFile(target, 'utf8').catch(() => '')
        if (current !== source)
            throw new Error('Generated API types are out of date. Run npm run api:types.')
    } else {
        await writeFile(target, source)
    }
} finally {
    await app.close()
}
