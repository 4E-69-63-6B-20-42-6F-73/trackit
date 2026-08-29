import { authRequest } from './authApi'

export type McpClientRecord = {
    id: string
    name: string
    scopes: string[]
    dateFrom: string | null
    dateTo: string | null
    expiresAt: string | null
    revokedAt: string | null
    lastUsedAt: string | null
    createdAt: string
}

export type McpAccessEvent = {
    id: string
    actor: string
    action: string
    targetId: string | null
    createdAt: string
}

export async function listMcpAccessEvents(): Promise<McpAccessEvent[]> {
    const response = await authRequest('/api/mcp/access-log')
    if (!response.ok) throw new Error('MCP access log unavailable')
    const events = (await response.json()) as { data: McpAccessEvent[] }
    return events.data
}

export async function getMcpStatus() {
    const response = await authRequest('/api/mcp/status')
    if (!response.ok) throw new Error('MCP settings unavailable')
    return (await response.json()) as {
        enabled: boolean
        clients: McpClientRecord[]
        allowedOrigins: string[]
    }
}

export async function setMcpAllowedOrigins(origins: string[]) {
    const response = await authRequest('/api/mcp/browser-origins', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ origins }),
    })
    if (!response.ok) throw new Error('Could not update MCP browser origins')
    return (await response.json()) as { allowedOrigins: string[] }
}

export async function setMcpEnabled(enabled: boolean) {
    const response = await authRequest('/api/mcp/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
    })
    if (!response.ok) throw new Error('Could not update MCP settings')
}

export async function issueMcpClient(input: {
    name: string
    scopes: string[]
    expiresAt?: string
    dateFrom?: string
    dateTo?: string
}) {
    const response = await authRequest('/api/mcp/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!response.ok) throw new Error('Could not issue MCP credential')
    return (await response.json()) as { client: McpClientRecord; token: string }
}

export async function revokeMcpClient(id: string) {
    const response = await authRequest(`/api/mcp/clients/${id}`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Could not revoke MCP credential')
}

export async function deleteMcpClient(id: string) {
    const response = await authRequest(`/api/mcp/clients/${id}/permanent`, { method: 'DELETE' })
    if (!response.ok) throw new Error('Could not delete MCP credential')
}
