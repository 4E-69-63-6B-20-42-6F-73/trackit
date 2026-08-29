import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    Code,
    Group,
    Modal,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core'
import {
    IconArrowLeft,
    IconCopy,
    IconPlus,
    IconRefresh,
    IconRobot,
    IconTrash,
} from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import {
    deleteMcpClient,
    getMcpStatus,
    listMcpAccessEvents,
    revokeMcpClient,
    setMcpAllowedOrigins,
    setMcpEnabled,
    type McpAccessEvent,
    type McpClientRecord,
} from '../../../lib/mcpApi'

const clientState = (client: McpClientRecord) => {
    if (client.revokedAt) return { label: 'Revoked', color: 'gray' }
    if (client.expiresAt && new Date(client.expiresAt) <= new Date())
        return { label: 'Expired', color: 'orange' }
    return { label: 'Active', color: 'green' }
}
const expiryLabel = (expiresAt: string | null) =>
    expiresAt ? `expires ${new Date(expiresAt).toLocaleDateString()}` : 'does not expire'
const scopeLabels: Record<string, string> = {
    observations: 'Measurements & insights',
    meals: 'Meals',
    journal: 'Journal',
    preferences: 'Preferences',
    'observations:write': 'Manage measurements',
    'meals:write': 'Add meals and manage foods',
    'checkins:write': 'Add check-ins',
}
const toolLabels: Record<string, string> = {
    get_metric_catalog: 'Viewed metric catalog',
    query_measurements: 'Analyzed measurements',
    list_measurements: 'Viewed measurements',
    compare_measurements: 'Compared measurements',
    list_observations: 'Viewed measurements',
    list_meals: 'Viewed meals',
    nutrition_summary: 'Analyzed nutrition',
    search_journal: 'Searched Journal',
    list_journal: 'Viewed Journal',
    log_measurement: 'Added a measurement',
    create_observation: 'Added a measurement',
    create_meal: 'Added a meal',
    search_foods: 'Searched foods',
    create_food: 'Created a food',
    add_food_to_meal: 'Added food to a meal',
    preview_create_food: 'Previewed a new food',
    preview_add_food_to_meal: 'Previewed food for a meal',
    log_checkin: 'Added a check-in',
    create_checkin: 'Added a check-in',
    preview_delete_observation: 'Previewed measurement deletion',
    delete_observation: 'Deleted a measurement',
}

export function McpAccess() {
    const navigate = useNavigate()
    const [enabled, setEnabled] = useState(false)
    const [clients, setClients] = useState<McpClientRecord[]>([])
    const [events, setEvents] = useState<McpAccessEvent[]>([])
    const [allowedOrigins, setAllowedOrigins] = useState<string[]>([])
    const [originDraft, setOriginDraft] = useState('')
    const [originError, setOriginError] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [copied, setCopied] = useState(false)
    const [revoking, setRevoking] = useState<McpClientRecord | null>(null)
    const [deleting, setDeleting] = useState<McpClientRecord | null>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const [status, accessEvents] = await Promise.all([
                getMcpStatus(),
                listMcpAccessEvents(),
            ])
            setEnabled(status.enabled)
            setClients(status.clients)
            setAllowedOrigins(status.allowedOrigins)
            setEvents(accessEvents)
            setError('')
        } catch {
            setError('Assistant access settings are unavailable. Try again.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        queueMicrotask(() => void refresh())
    }, [refresh])

    const orderedClients = useMemo(
        () =>
            [...clients].sort((left, right) => {
                const leftActive =
                    !left.revokedAt && (!left.expiresAt || new Date(left.expiresAt) > new Date())
                const rightActive =
                    !right.revokedAt && (!right.expiresAt || new Date(right.expiresAt) > new Date())
                return Number(rightActive) - Number(leftActive)
            }),
        [clients],
    )
    const activeClients = orderedClients.filter(client => clientState(client).label === 'Active')
    const inactiveClients = orderedClients.filter(client => clientState(client).label !== 'Active')

    const toggle = async (checked: boolean) => {
        setSaving(true)
        try {
            await setMcpEnabled(checked)
            setEnabled(checked)
            setError('')
        } catch {
            setError('Assistant access could not be updated. Try again.')
        } finally {
            setSaving(false)
        }
    }

    const revoke = async () => {
        if (!revoking) return
        setSaving(true)
        try {
            await revokeMcpClient(revoking.id)
            setClients(current =>
                current.map(client =>
                    client.id === revoking.id
                        ? { ...client, revokedAt: new Date().toISOString() }
                        : client,
                ),
            )
            setRevoking(null)
            setError('')
        } catch {
            setError(`Could not revoke ${revoking.name}. Try again.`)
        } finally {
            setSaving(false)
        }
    }
    const remove = async () => {
        if (!deleting) return
        setSaving(true)
        try {
            await deleteMcpClient(deleting.id)
            setClients(current => current.filter(client => client.id !== deleting.id))
            setDeleting(null)
            setError('')
        } catch {
            setError(`Could not delete ${deleting.name}. Try again.`)
        } finally {
            setSaving(false)
        }
    }
    const copyEndpoint = async () => {
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/mcp`)
            setCopied(true)
        } catch {
            setError('The endpoint could not be copied automatically.')
        }
    }
    const addOrigin = () => {
        const value = originDraft.trim()
        try {
            const url = new URL(value)
            if (url.protocol !== 'https:' || url.origin !== value) throw new Error('invalid')
        } catch {
            setOriginError('Enter an exact HTTPS origin, such as https://assistant.example.net')
            return
        }
        if (allowedOrigins.includes(value)) {
            setOriginError('That origin is already allowed.')
            return
        }
        setAllowedOrigins(current => [...current, value])
        setOriginDraft('')
        setOriginError('')
    }
    const saveOrigins = async () => {
        setSaving(true)
        try {
            const result = await setMcpAllowedOrigins(allowedOrigins)
            setAllowedOrigins(result.allowedOrigins)
            setOriginError('')
            setError('')
        } catch {
            setError('Browser origins could not be updated. Try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="page-content mcp-page">
            <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => navigate('/connections')}
                mb="md"
            >
                Back to Connections
            </Button>
            <Group className="mcp-heading" justify="space-between" align="flex-end">
                <div>
                    <Title order={1} mb={4}>
                        Assistant access
                    </Title>
                    <Text c="dimmed">
                        Give compatible assistants separate, limited access to analyze or change
                        your TrackIt data.
                    </Text>
                </div>
                <Button
                    color="trackit"
                    leftSection={<IconPlus size={16} />}
                    disabled={!enabled}
                    onClick={() => navigate('/connections/mcp/new')}
                >
                    Add assistant
                </Button>
            </Group>

            {error && (
                <Alert color="orange" mt="lg">
                    {error}
                </Alert>
            )}

            <Card withBorder radius="md" padding="lg" className="mcp-endpoint-card">
                <div>
                    <Text fw={700}>MCP endpoint</Text>
                    <Text size="sm" c="dimmed">
                        Turning this off immediately blocks every assistant without deleting their
                        access records.
                    </Text>
                </div>
                <Switch
                    checked={enabled}
                    disabled={saving}
                    onChange={event => void toggle(event.currentTarget.checked)}
                    label={enabled ? 'Enabled' : 'Disabled'}
                />
                <div className="mcp-endpoint">
                    <Text size="xs" c="dimmed" mb={5}>
                        Endpoint
                    </Text>
                    <Group gap="xs" wrap="nowrap">
                        <Code className="mcp-endpoint-code">{`${window.location.origin}/mcp`}</Code>
                        <ActionIcon
                            variant="default"
                            aria-label="Copy MCP endpoint"
                            onClick={() => void copyEndpoint()}
                        >
                            <IconCopy size={16} />
                        </ActionIcon>
                        {copied && (
                            <Text size="xs" c="teal">
                                Copied
                            </Text>
                        )}
                    </Group>
                </div>
            </Card>

            <Card withBorder radius="md" padding="lg">
                <Stack gap="sm">
                    <div>
                        <Text fw={700}>Browser client origins</Text>
                        <Text size="sm" c="dimmed">
                            Allow browser-based assistants on these exact HTTPS origins to connect
                            to the MCP endpoint. Server-side assistants do not need an origin here.
                        </Text>
                    </div>
                    {allowedOrigins.map(origin => (
                        <Group key={origin} justify="space-between" wrap="nowrap">
                            <Code>{origin}</Code>
                            <ActionIcon
                                variant="subtle"
                                color="red"
                                aria-label={`Remove ${origin}`}
                                onClick={() =>
                                    setAllowedOrigins(current =>
                                        current.filter(candidate => candidate !== origin),
                                    )
                                }
                            >
                                <IconTrash size={16} />
                            </ActionIcon>
                        </Group>
                    ))}
                    <Group align="flex-start">
                        <TextInput
                            value={originDraft}
                            onChange={event => setOriginDraft(event.currentTarget.value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter') {
                                    event.preventDefault()
                                    addOrigin()
                                }
                            }}
                            placeholder="https://assistant.example.net"
                            error={originError}
                            style={{ flex: 1 }}
                        />
                        <Button
                            variant="default"
                            onClick={addOrigin}
                            disabled={!originDraft.trim()}
                        >
                            Add origin
                        </Button>
                    </Group>
                    <Group justify="flex-end">
                        <Button loading={saving} onClick={() => void saveOrigins()}>
                            Save browser origins
                        </Button>
                    </Group>
                </Stack>
            </Card>

            <Group className="mcp-section-heading" justify="space-between">
                <div>
                    <Text fw={700}>Assistants</Text>
                    <Text size="sm" c="dimmed">
                        Each assistant has its own credential, permissions, and expiry.
                    </Text>
                </div>
                <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Refresh assistants"
                    loading={loading}
                    onClick={() => void refresh()}
                >
                    <IconRefresh size={17} />
                </ActionIcon>
            </Group>

            {clients.length ? (
                <div className="mcp-client-groups">
                    {activeClients.length > 0 && (
                        <Card withBorder padding={0} radius="md" className="mcp-client-list">
                            {activeClients.map(client => {
                                const state = clientState(client)
                                return (
                                    <div className="mcp-client-row" key={client.id}>
                                        <div className="mcp-client-icon">
                                            <IconRobot size={19} />
                                        </div>
                                        <div>
                                            <Group gap="xs">
                                                <Text fw={650}>{client.name}</Text>
                                                <Badge
                                                    size="sm"
                                                    variant="light"
                                                    color={state.color}
                                                >
                                                    {state.label}
                                                </Badge>
                                            </Group>
                                            <Text
                                                size="xs"
                                                c="dimmed"
                                                className="mcp-client-scopes"
                                            >
                                                {client.scopes
                                                    .map(scope => scopeLabels[scope] ?? scope)
                                                    .join(' · ')}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                Last used{' '}
                                                {client.lastUsedAt
                                                    ? new Date(client.lastUsedAt).toLocaleString()
                                                    : 'never'}{' '}
                                                · {expiryLabel(client.expiresAt)}
                                            </Text>
                                        </div>
                                        <Group className="mcp-client-actions" gap="xs">
                                            <Button
                                                variant="subtle"
                                                color="red"
                                                size="compact-sm"
                                                onClick={() => setRevoking(client)}
                                            >
                                                Revoke access
                                            </Button>
                                            <Button
                                                variant="subtle"
                                                color="gray"
                                                size="compact-sm"
                                                onClick={() => setDeleting(client)}
                                            >
                                                Delete
                                            </Button>
                                        </Group>
                                    </div>
                                )
                            })}
                        </Card>
                    )}
                    {inactiveClients.length > 0 && (
                        <details className="mcp-inactive-list">
                            <summary>Inactive assistants ({inactiveClients.length})</summary>
                            <Card withBorder padding={0} radius="md" className="mcp-client-list">
                                {inactiveClients.map(client => {
                                    const state = clientState(client)
                                    return (
                                        <div
                                            className="mcp-client-row mcp-client-row-inactive"
                                            key={client.id}
                                        >
                                            <div className="mcp-client-icon">
                                                <IconRobot size={19} />
                                            </div>
                                            <div>
                                                <Group gap="xs">
                                                    <Text fw={650}>{client.name}</Text>
                                                    <Badge
                                                        size="sm"
                                                        variant="light"
                                                        color={state.color}
                                                    >
                                                        {state.label}
                                                    </Badge>
                                                </Group>
                                                <Text size="xs" c="dimmed">
                                                    {client.scopes
                                                        .map(scope => scopeLabels[scope] ?? scope)
                                                        .join(' · ')}
                                                </Text>
                                            </div>
                                            <Button
                                                variant="subtle"
                                                color="red"
                                                size="compact-sm"
                                                onClick={() => setDeleting(client)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    )
                                })}
                            </Card>
                        </details>
                    )}
                </div>
            ) : (
                !loading && (
                    <Card withBorder padding="xl" radius="md" ta="center" className="mcp-empty">
                        <IconRobot size={36} />
                        <Text fw={650}>No assistants connected</Text>
                        <Text size="sm" c="dimmed">
                            Create a separate credential for each assistant you want to use.
                        </Text>
                        <Button
                            mt="sm"
                            disabled={!enabled}
                            onClick={() => navigate('/connections/mcp/new')}
                        >
                            Add your first assistant
                        </Button>
                    </Card>
                )
            )}

            <section className="mcp-activity">
                <Text fw={700}>Recent access</Text>
                <Text size="sm" c="dimmed" mb="sm">
                    The latest analysis and data changes made through assistant credentials.
                </Text>
                <Card withBorder padding={0} radius="md">
                    {events.length ? (
                        events.slice(0, 10).map(event => {
                            const clientId = event.actor.startsWith('mcp:')
                                ? event.actor.slice(4)
                                : event.actor
                            const name =
                                clients.find(client => client.id === clientId)?.name ??
                                'Revoked assistant'
                            return (
                                <div className="mcp-access-row" key={event.id}>
                                    <Text size="sm" fw={600}>
                                        {name}
                                    </Text>
                                    <div className="mcp-access-action">
                                        <Text size="sm">
                                            {toolLabels[event.targetId ?? ''] ??
                                                'Used an assistant tool'}
                                        </Text>
                                        <Code>{event.targetId ?? 'Unknown tool'}</Code>
                                    </div>
                                    <Text size="xs" c="dimmed">
                                        {new Date(event.createdAt).toLocaleString()}
                                    </Text>
                                </div>
                            )
                        })
                    ) : (
                        <Text size="sm" c="dimmed" p="lg">
                            No assistant requests recorded yet.
                        </Text>
                    )}
                </Card>
            </section>

            <Modal
                opened={Boolean(revoking)}
                onClose={() => setRevoking(null)}
                title="Revoke assistant access?"
                centered
                size="sm"
            >
                <Text size="sm">
                    Revoke {revoking?.name}? Its credential will stop working immediately. Other
                    assistants are not affected.
                </Text>
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={() => setRevoking(null)}>
                        Cancel
                    </Button>
                    <Button color="red" loading={saving} onClick={() => void revoke()}>
                        Revoke access
                    </Button>
                </Group>
            </Modal>
            <Modal
                opened={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title="Delete assistant?"
                centered
                size="sm"
            >
                <Text size="sm">
                    Permanently delete {deleting?.name}? Its credential will stop working and its
                    saved access settings will be removed. Audit history is retained.
                </Text>
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={() => setDeleting(null)}>
                        Cancel
                    </Button>
                    <Button color="red" loading={saving} onClick={() => void remove()}>
                        Delete assistant
                    </Button>
                </Group>
            </Modal>
        </div>
    )
}
