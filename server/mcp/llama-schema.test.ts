import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { createTrackItMcpServer } from './server.js'
import type { McpClient } from './service.js'

const grant: McpClient = {
    id: 'llama-schema-client',
    name: 'Llama schema test',
    scopes: [
        'observations',
        'meals',
        'journal',
        'preferences',
        'observations:write',
        'meals:write',
        'checkins:write',
    ],
    dateFrom: new Date('2026-01-01T00:00:00Z'),
    dateTo: new Date('2026-12-31T23:59:59Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
}

const schemaViolations = (value: unknown, path = 'inputSchema'): string[] => {
    if (Array.isArray(value))
        return value.flatMap((item, index) => schemaViolations(item, `${path}[${index}]`))
    if (!value || typeof value !== 'object') return []

    const schema = value as Record<string, unknown>
    const violations: string[] = []
    const pattern = schema.pattern
    if (typeof pattern === 'string') {
        if (!pattern.startsWith('^') || !pattern.endsWith('$'))
            violations.push(`${path}.pattern must be anchored`)
        if (/\\[dws]/.test(pattern))
            violations.push(`${path}.pattern uses an unsupported regex shorthand`)
        if (pattern.includes('\\/'))
            violations.push(`${path}.pattern uses an unsupported escaped slash`)
    }
    if ('properties' in schema && ('anyOf' in schema || 'oneOf' in schema))
        violations.push(`${path} mixes properties with a union`)

    return [
        ...violations,
        ...Object.entries(schema).flatMap(([key, child]) =>
            schemaViolations(child, `${path}.${key}`),
        ),
    ]
}

describe('Llama MCP schema compatibility', () => {
    it('avoids known llama.cpp grammar-breaking schema constructs', async () => {
        const server = createTrackItMcpServer(grant, {} as never, {} as never, {} as never)
        const client = new Client({ name: 'llama-schema-test', version: '1.0.0' })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

        const tools = (await client.listTools()).tools
        const violations = tools.flatMap(tool =>
            schemaViolations(tool.inputSchema, `tools.${tool.name}.inputSchema`),
        )

        expect(violations).toEqual([])

        await client.close()
        await server.close()
    })
})
