import {
    Alert,
    Button,
    Code,
    Group,
    MultiSelect,
    NumberInput,
    Stack,
    Switch,
    Text,
    TextInput,
} from '@mantine/core'
import { useEffect, useState } from 'react'
import {
    getMcpStatus,
    issueMcpClient,
    listMcpAccessEvents,
    revokeMcpClient,
    setMcpEnabled,
    type McpClientRecord,
    type McpAccessEvent,
} from '../lib/mcpApi'

const scopes = [
    'observations',
    'meals',
    'journal',
    'preferences',
    'observations:write',
    'meals:write',
    'checkins:write',
    'journal:delete',
]

export function McpPanel({ onEnabledChange }: { onEnabledChange: (enabled: boolean) => void }) {
    const [enabled, setEnabled] = useState(false)
    const [clients, setClients] = useState<McpClientRecord[]>([])
    const [name, setName] = useState('My assistant')
    const [selectedScopes, setSelectedScopes] = useState<string[]>(['observations'])
    const [token, setToken] = useState('')
    const [error, setError] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [expiryDays, setExpiryDays] = useState<number | string>(30)
    const [accessEvents, setAccessEvents] = useState<McpAccessEvent[]>([])

    useEffect(() => {
        void getMcpStatus()
            .then(status => {
                setEnabled(status.enabled)
                setClients(status.clients)
                onEnabledChange(status.enabled)
            })
            .catch(() => setError('MCP settings are unavailable.'))
    }, [onEnabledChange])

    useEffect(() => {
        void listMcpAccessEvents()
            .then(setAccessEvents)
            .catch(() => setError('MCP access history is unavailable.'))
    }, [])

    const toggle = async (checked: boolean) => {
        try {
            await setMcpEnabled(checked)
            setEnabled(checked)
            onEnabledChange(checked)
            setError('')
        } catch {
            setError('MCP could not be updated. Try again.')
        }
    }

    const issue = async () => {
        const expiresAt = new Date(
            Date.now() + Number(expiryDays) * 24 * 60 * 60 * 1000,
        ).toISOString()
        try {
            const result = await issueMcpClient({
                name,
                scopes: selectedScopes,
                expiresAt,
                dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : undefined,
                dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
            })
            setToken(result.token)
            setClients(current => [result.client, ...current])
            setError('')
        } catch {
            setError('The client credential could not be issued.')
        }
    }

    const revoke = async (id: string) => {
        try {
            await revokeMcpClient(id)
            setClients(current =>
                current.map(client =>
                    client.id === id ? { ...client, revokedAt: new Date().toISOString() } : client,
                ),
            )
            setError('')
        } catch {
            setError('The client could not be revoked. Try again.')
        }
    }

    return (
        <Stack>
            <Text size="sm" c="dimmed">
                Enabling the endpoint does not create a credential. Each client receives only the
                selected capabilities and expires automatically. Write and delete capabilities are
                separately named and never implied by a read grant.
            </Text>
            <Switch
                checked={enabled}
                onChange={event => void toggle(event.currentTarget.checked)}
                label="Enable MCP endpoint"
                description="Disabled by default"
            />
            <TextInput
                readOnly
                value={enabled ? `${window.location.origin}/mcp` : 'Enable the endpoint first'}
                label="Endpoint"
            />
            {enabled && (
                <>
                    <TextInput
                        label="Client name"
                        value={name}
                        onChange={event => setName(event.currentTarget.value)}
                    />
                    <MultiSelect
                        label="Granted capabilities"
                        description="Select only what this client needs. Names ending in :write can create records."
                        data={scopes}
                        value={selectedScopes}
                        onChange={setSelectedScopes}
                    />
                    {selectedScopes.some(scope =>
                        [':write', ':delete'].some(suffix => scope.endsWith(suffix)),
                    ) && (
                        <Alert color="orange" title="This client can change data">
                            Review the write or delete grants before issuing this credential.
                            Destructive actions still require an exact, short-lived confirmation.
                        </Alert>
                    )}
                    <Group grow>
                        <TextInput
                            type="date"
                            label="Earliest accessible date (optional)"
                            value={dateFrom}
                            onChange={event => setDateFrom(event.currentTarget.value)}
                        />
                        <TextInput
                            type="date"
                            label="Latest accessible date (optional)"
                            min={dateFrom}
                            value={dateTo}
                            onChange={event => setDateTo(event.currentTarget.value)}
                        />
                    </Group>
                    <NumberInput
                        label="Credential lifetime"
                        suffix=" days"
                        min={1}
                        max={365}
                        value={expiryDays}
                        onChange={setExpiryDays}
                    />
                    <Button
                        disabled={
                            !name.trim() ||
                            !selectedScopes.length ||
                            Number(expiryDays) < 1 ||
                            Boolean(dateFrom && dateTo && dateFrom > dateTo)
                        }
                        onClick={() => void issue()}
                    >
                        Issue credential
                    </Button>
                </>
            )}
            {token && (
                <Alert color="teal" title="Copy this token now">
                    It is shown once and stored only as a hash.
                    <Code block mt="xs">
                        {token}
                    </Code>
                </Alert>
            )}
            {error && <Alert color="orange">{error}</Alert>}
            {clients.map(client => (
                <Group key={client.id} justify="space-between" wrap="nowrap">
                    <div>
                        <Text size="sm" fw={600}>
                            {client.name}
                        </Text>
                        <Text size="xs" c="dimmed">
                            {client.scopes.join(', ')} · last used{' '}
                            {client.lastUsedAt
                                ? new Date(client.lastUsedAt).toLocaleString()
                                : 'never'}
                        </Text>
                        <Text size="xs" c="dimmed">
                            Expires {new Date(client.expiresAt).toLocaleString()}
                            {client.dateFrom || client.dateTo
                                ? ` · accessible dates ${client.dateFrom ? new Date(client.dateFrom).toLocaleDateString() : 'any'} to ${client.dateTo ? new Date(client.dateTo).toLocaleDateString() : 'any'}`
                                : ' · all dates'}
                        </Text>
                    </div>
                    <Button
                        size="xs"
                        variant="default"
                        disabled={Boolean(client.revokedAt)}
                        onClick={() => void revoke(client.id)}
                    >
                        {client.revokedAt ? 'Revoked' : 'Revoke'}
                    </Button>
                </Group>
            ))}
            <div>
                <Text fw={600} size="sm">
                    Recent MCP access
                </Text>
                {accessEvents.length ? (
                    accessEvents.slice(0, 10).map(event => {
                        const clientId = event.actor.startsWith('mcp:')
                            ? event.actor.slice(4)
                            : event.actor
                        const clientName =
                            clients.find(client => client.id === clientId)?.name ??
                            'Revoked or deleted client'
                        return (
                            <Text key={event.id} size="xs" c="dimmed">
                                {clientName} · {event.targetId ?? 'unknown tool'} ·{' '}
                                {new Date(event.createdAt).toLocaleString()}
                            </Text>
                        )
                    })
                ) : (
                    <Text size="xs" c="dimmed">
                        No MCP requests recorded yet.
                    </Text>
                )}
            </div>
        </Stack>
    )
}
