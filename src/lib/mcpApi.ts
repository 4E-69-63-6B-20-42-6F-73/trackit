import type { paths } from './api.generated'
import { apiClient } from './apiClient'

export type McpClientRecord =
    paths['/api/mcp/status']['get']['responses'][200]['content']['application/json']['clients'][number]
export type McpAccessEvent =
    paths['/api/mcp/access-log']['get']['responses'][200]['content']['application/json']['data'][number]
export type McpIssueInput =
    paths['/api/mcp/clients']['post']['requestBody']['content']['application/json']

type SignalInput = AbortSignal | { signal: AbortSignal }

const signalFrom = (input?: SignalInput) => (input && 'signal' in input ? input.signal : input)

export async function listMcpAccessEvents(signal?: AbortSignal): Promise<McpAccessEvent[]> {
    const { data, response } = await apiClient.GET('/api/mcp/access-log', { signal })
    if (!response.ok || !data) throw new Error('MCP access log unavailable')
    return data.data
}

export async function getMcpStatus(input?: SignalInput) {
    const { data, response } = await apiClient.GET('/api/mcp/status', {
        signal: signalFrom(input),
    })
    if (!response.ok || !data) throw new Error('MCP settings unavailable')
    return data
}

export async function setMcpAllowedOrigins(origins: string[]) {
    const { data, response } = await apiClient.PUT('/api/mcp/browser-origins', {
        body: { origins },
    })
    if (!response.ok || !data) throw new Error('Could not update MCP browser origins')
    return data
}

export async function setMcpEnabled(enabled: boolean) {
    const { response } = await apiClient.PATCH('/api/mcp/status', { body: { enabled } })
    if (!response.ok) throw new Error('Could not update MCP settings')
}

export async function issueMcpClient(input: McpIssueInput) {
    const { data, response } = await apiClient.POST('/api/mcp/clients', { body: input })
    if (!response.ok || !data) throw new Error('Could not issue MCP credential')
    return data
}

export async function revokeMcpClient(id: string) {
    const { response } = await apiClient.DELETE('/api/mcp/clients/{id}', {
        params: { path: { id } },
    })
    if (!response.ok) throw new Error('Could not revoke MCP credential')
}

export async function deleteMcpClient(id: string) {
    const { response } = await apiClient.DELETE('/api/mcp/clients/{id}/permanent', {
        params: { path: { id } },
    })
    if (!response.ok) throw new Error('Could not delete MCP credential')
}
