import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'
import { registerMeasurementInsightTools } from './insights.js'
import type { McpClient } from './service.js'

const grant: McpClient = {
    id: 'client-id',
    name: 'Insights client',
    scopes: ['observations'],
    dateFrom: new Date('2026-01-01T00:00:00Z'),
    dateTo: new Date('2026-01-31T23:59:59.999Z'),
    expiresAt: new Date('2027-01-01T00:00:00Z'),
}

const records = [
    {
        id: 'steps-1',
        definitionId: 'steps',
        canonicalValue: 100,
        canonicalUnit: 'count',
        originalValue: 100,
        originalUnit: 'count',
        observedAt: '2026-01-10T08:00:00Z',
        provider: 'health_connect',
        excluded: false,
        version: 1,
    },
    {
        id: 'steps-2',
        definitionId: 'steps',
        canonicalValue: 200,
        canonicalUnit: 'count',
        originalValue: 200,
        originalUnit: 'count',
        observedAt: '2026-01-10T18:00:00Z',
        provider: 'health_connect',
        excluded: false,
        version: 1,
    },
    {
        id: 'weight-1',
        definitionId: 'weight',
        canonicalValue: 80,
        canonicalUnit: 'kg',
        originalValue: 80,
        originalUnit: 'kg',
        observedAt: '2026-01-10T07:00:00Z',
        connector: 'manual',
        excluded: false,
        version: 1,
    },
    {
        id: 'weight-2',
        definitionId: 'weight',
        canonicalValue: 79.5,
        canonicalUnit: 'kg',
        originalValue: 79.5,
        originalUnit: 'kg',
        observedAt: '2026-01-10T20:00:00Z',
        connector: 'manual',
        excluded: false,
        version: 1,
    },
]

const connect = async (clientGrant = grant) => {
    const data = {
        getPreferences: vi.fn(async () => ({ timezone: 'UTC' })),
        listMetricCoverage: vi.fn(async () => [
            {
                definitionId: 'steps',
                recordCount: 2,
                availableFrom: '2026-01-10T08:00:00.000Z',
                availableTo: '2026-01-10T18:00:00.000Z',
                sources: ['health_connect'],
            },
            {
                definitionId: 'weight',
                recordCount: 2,
                availableFrom: '2026-01-10T07:00:00.000Z',
                availableTo: '2026-01-10T20:00:00.000Z',
                sources: ['manual'],
            },
        ]),
        listObservations: vi.fn(async ({ definitionIds }: { definitionIds?: string[] }) =>
            definitionIds
                ? records.filter(record => definitionIds.includes(record.definitionId))
                : records,
        ),
    }
    const server = new McpServer({ name: 'TrackIt test', version: '1.0.0' })
    registerMeasurementInsightTools(server, clientGrant, data as never)
    const client = new Client({ name: 'insights-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    return { client, server, data }
}

describe('MCP measurement insights', () => {
    it('discovers analyzable metrics without loading observation history', async () => {
        const { client, server, data } = await connect()
        const response = await client.callTool({ name: 'get_metric_catalog', arguments: {} })
        const payload = JSON.parse((response as { content: { text: string }[] }).content[0].text)

        expect(payload.metrics).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    definitionId: 'steps',
                    label: 'Steps',
                    recordCount: 2,
                    dailyAggregation: 'sum',
                    periodAggregation: 'sum',
                    sources: ['health_connect'],
                    coverageBasis: 'stored_records',
                }),
                expect.objectContaining({
                    definitionId: 'weight',
                    label: 'Weight',
                    recordCount: 2,
                    dailyAggregation: 'latest',
                    periodAggregation: 'average',
                }),
            ]),
        )
        expect(data.listMetricCoverage).toHaveBeenCalledTimes(1)
        expect(data.listObservations).not.toHaveBeenCalled()
        expect(payload.metadata.provenance).toBe(
            'TrackIt metric catalog and compact measurement coverage',
        )

        await client.close()
        await server.close()
    })

    it('queries multiple metrics and aggregates daily values before analysis', async () => {
        const { client, server } = await connect()
        const response = await client.callTool({
            name: 'query_measurements',
            arguments: {
                definitionIds: ['steps', 'weight'],
                from: '2026-01-10T00:00:00Z',
                to: '2026-01-11T00:00:00Z',
                granularity: 'day',
            },
        })
        const payload = JSON.parse((response as { content: { text: string }[] }).content[0].text)
        const steps = payload.series.find(
            (series: { definitionId: string }) => series.definitionId === 'steps',
        )
        const weight = payload.series.find(
            (series: { definitionId: string }) => series.definitionId === 'weight',
        )

        expect(steps.points).toEqual([
            { period: '2026-01-10', value: 300, coveredDays: 1, totalDays: 1 },
        ])
        expect(weight.points).toEqual([
            { period: '2026-01-10', value: 79.5, coveredDays: 1, totalDays: 1 },
        ])
        expect(payload.metadata).toMatchObject({
            timezone: 'UTC',
            granularity: 'day',
            provenance: 'TrackIt effective measurement series',
        })

        await client.close()
        await server.close()
    })

    it('requires the measurement read permission', async () => {
        const { client, server } = await connect({ ...grant, scopes: ['journal'] })
        const catalog = await client.callTool({ name: 'get_metric_catalog', arguments: {} })
        const query = await client.callTool({
            name: 'query_measurements',
            arguments: { definitionIds: ['weight'] },
        })

        expect(catalog.isError).toBe(true)
        expect(query.isError).toBe(true)

        await client.close()
        await server.close()
    })
})
