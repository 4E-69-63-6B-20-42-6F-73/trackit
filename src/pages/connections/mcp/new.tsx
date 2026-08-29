import { useEffect, useState } from 'react'
import {
    Alert,
    Button,
    Card,
    Code,
    Group,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
} from '@mantine/core'
import { IconArrowLeft, IconCopy, IconRobot } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { getMcpStatus, issueMcpClient } from '../../../lib/mcpApi'

const scopes = [
    {
        value: 'observations',
        label: 'Measurements & insights',
        description: 'View metric definitions and measurement history for trend analysis.',
        group: 'View and analyze',
    },
    {
        value: 'meals',
        label: 'Meals',
        description: 'View meal history and stored nutrient snapshots.',
        group: 'View and analyze',
    },
    {
        value: 'journal',
        label: 'Journal',
        description: 'Search Journal titles and details within the allowed date range.',
        group: 'View and analyze',
    },
    {
        value: 'preferences',
        label: 'Preferences',
        description: 'View non-sensitive display, timezone, and unit preferences.',
        group: 'View and analyze',
    },
    {
        value: 'observations:write',
        label: 'Manage measurements',
        description: 'Add measurements and confirm deletion of measurement-backed records.',
        group: 'Change data',
    },
    {
        value: 'meals:write',
        label: 'Add meals and manage foods',
        description: 'Create foods and add saved foods to meals after preview confirmation.',
        group: 'Change data',
    },
    {
        value: 'checkins:write',
        label: 'Add check-ins',
        description: 'Create Journal check-ins with assistant provenance.',
        group: 'Change data',
    },
]

const defaultExpiryDate = () => {
    const date = new Date()
    date.setDate(date.getDate() + 30)
    return date.toISOString().slice(0, 10)
}

export function McpNew() {
    const navigate = useNavigate()
    const [enabled, setEnabled] = useState<boolean | null>(null)
    const [name, setName] = useState('')
    const [selectedScopes, setSelectedScopes] = useState<string[]>(['observations'])
    const [dateFromEnabled, setDateFromEnabled] = useState(false)
    const [dateFrom, setDateFrom] = useState('')
    const [dateToEnabled, setDateToEnabled] = useState(false)
    const [dateTo, setDateTo] = useState('')
    const [expiryEnabled, setExpiryEnabled] = useState(true)
    const [expiresOn, setExpiresOn] = useState(defaultExpiryDate)
    const [token, setToken] = useState('')
    const [saving, setSaving] = useState(false)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        void getMcpStatus()
            .then(status => setEnabled(status.enabled))
            .catch(() => setEnabled(false))
    }, [])

    const issue = async () => {
        setSaving(true)
        try {
            const result = await issueMcpClient({
                name: name.trim(),
                scopes: selectedScopes,
                expiresAt: expiryEnabled
                    ? new Date(`${expiresOn}T23:59:59.999`).toISOString()
                    : undefined,
                dateFrom:
                    dateFromEnabled && dateFrom
                        ? new Date(`${dateFrom}T00:00:00`).toISOString()
                        : undefined,
                dateTo:
                    dateToEnabled && dateTo
                        ? new Date(`${dateTo}T23:59:59.999`).toISOString()
                        : undefined,
            })
            setToken(result.token)
            setError('')
        } catch {
            setError('The assistant credential could not be created. Try again.')
        } finally {
            setSaving(false)
        }
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(token)
            setCopied(true)
        } catch {
            setError('The token could not be copied automatically. Select and copy it manually.')
        }
    }

    const reset = () => {
        setName('')
        setSelectedScopes(['observations'])
        setDateFromEnabled(false)
        setDateFrom('')
        setDateToEnabled(false)
        setDateTo('')
        setExpiryEnabled(true)
        setExpiresOn(defaultExpiryDate())
        setToken('')
        setCopied(false)
    }

    const hasWriteScope = selectedScopes.some(
        scope => scope.endsWith(':write') || scope.endsWith(':delete'),
    )
    const valid =
        name.trim() &&
        selectedScopes.length &&
        (!expiryEnabled || Boolean(expiresOn)) &&
        (!dateFromEnabled || Boolean(dateFrom)) &&
        (!dateToEnabled || Boolean(dateTo)) &&
        !(dateFromEnabled && dateToEnabled && dateFrom > dateTo)

    return (
        <div className="page-content mcp-page mcp-new-page">
            <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => navigate('/connections/mcp')}
                mb="md"
            >
                Back to Assistants
            </Button>
            <Title order={1} mb={4}>
                Add assistant
            </Title>
            <Text c="dimmed" mb="xl">
                Create a unique, limited credential for one assistant.
            </Text>

            {enabled === false && (
                <Alert color="orange" mb="lg">
                    Enable the MCP endpoint on the Assistant access page before creating a
                    credential.
                </Alert>
            )}
            {error && (
                <Alert color="orange" mb="lg">
                    {error}
                </Alert>
            )}

            {token ? (
                <Card withBorder radius="md" padding="xl" className="mcp-token-card">
                    <IconRobot size={32} />
                    <Title order={2}>Save this credential now</Title>
                    <Text size="sm" c="dimmed">
                        This token is shown once. TrackIt stores only its secure hash.
                    </Text>
                    <Code block>{token}</Code>
                    <Group>
                        <Button leftSection={<IconCopy size={16} />} onClick={() => void copy()}>
                            {copied ? 'Copied' : 'Copy token'}
                        </Button>
                        <Button variant="default" onClick={() => navigate('/connections/mcp')}>
                            Back to assistants
                        </Button>
                        <Button variant="subtle" onClick={reset}>
                            Add another assistant
                        </Button>
                    </Group>
                </Card>
            ) : (
                <Card withBorder radius="md" padding="xl" className="mcp-form-card">
                    <Stack gap="lg">
                        <TextInput
                            label="Assistant name"
                            description="Use a recognizable name, such as Claude Desktop or Nutrition coach."
                            placeholder="My assistant"
                            value={name}
                            onChange={event => setName(event.currentTarget.value)}
                            required
                        />
                        <div>
                            <Group justify="space-between" mb="xs">
                                <div>
                                    <Text size="sm" fw={600}>
                                        Permissions
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Read access can reveal sensitive personal data. Grant only
                                        what this assistant needs.
                                    </Text>
                                </div>
                                <Group gap="xs">
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        onClick={() =>
                                            setSelectedScopes(scopes.map(scope => scope.value))
                                        }
                                    >
                                        Enable all
                                    </Button>
                                    <Button
                                        size="compact-xs"
                                        variant="subtle"
                                        color="gray"
                                        onClick={() => setSelectedScopes([])}
                                    >
                                        Disable all
                                    </Button>
                                </Group>
                            </Group>
                            {['View and analyze', 'Change data'].map(group => (
                                <div className="mcp-permission-group" key={group}>
                                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                                        {group}
                                    </Text>
                                    <div className="mcp-permission-list">
                                        {scopes
                                            .filter(scope => scope.group === group)
                                            .map(scope => (
                                                <Switch
                                                    key={scope.value}
                                                    label={scope.label}
                                                    description={scope.description}
                                                    checked={selectedScopes.includes(scope.value)}
                                                    onChange={event => {
                                                        const checked = event.currentTarget.checked
                                                        setSelectedScopes(current =>
                                                            checked
                                                                ? [...current, scope.value]
                                                                : current.filter(
                                                                      value =>
                                                                          value !== scope.value,
                                                                  ),
                                                        )
                                                    }}
                                                />
                                            ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {hasWriteScope && (
                            <Alert color="orange" title="This assistant can change data">
                                Change permissions can modify your TrackIt records. Destructive
                                actions still require short-lived confirmation.
                            </Alert>
                        )}
                        <details className="mcp-access-limits">
                            <summary>
                                <span>
                                    Access limits <small>Optional</small>
                                </span>
                                <Text size="xs" c="dimmed">
                                    Limit dates and credential lifetime
                                </Text>
                            </summary>
                            <div className="mcp-access-limit-fields">
                                <div className="mcp-optional-field">
                                    <Switch
                                        checked={dateFromEnabled}
                                        onChange={event =>
                                            setDateFromEnabled(event.currentTarget.checked)
                                        }
                                        label="Limit earliest accessible date"
                                    />
                                    {dateFromEnabled && (
                                        <TextInput
                                            type="date"
                                            label="Earliest accessible date"
                                            value={dateFrom}
                                            onChange={event =>
                                                setDateFrom(event.currentTarget.value)
                                            }
                                            required
                                        />
                                    )}
                                </div>
                                <div className="mcp-optional-field">
                                    <Switch
                                        checked={dateToEnabled}
                                        onChange={event =>
                                            setDateToEnabled(event.currentTarget.checked)
                                        }
                                        label="Limit latest accessible date"
                                    />
                                    {dateToEnabled && (
                                        <TextInput
                                            type="date"
                                            label="Latest accessible date"
                                            min={dateFromEnabled ? dateFrom : undefined}
                                            value={dateTo}
                                            onChange={event => setDateTo(event.currentTarget.value)}
                                            required
                                        />
                                    )}
                                </div>
                                <div className="mcp-optional-field">
                                    <Switch
                                        checked={expiryEnabled}
                                        onChange={event =>
                                            setExpiryEnabled(event.currentTarget.checked)
                                        }
                                        label="Credential expires"
                                    />
                                    {expiryEnabled && (
                                        <TextInput
                                            type="date"
                                            label="Credential end date"
                                            min={new Date().toISOString().slice(0, 10)}
                                            value={expiresOn}
                                            onChange={event =>
                                                setExpiresOn(event.currentTarget.value)
                                            }
                                            required
                                        />
                                    )}
                                </div>
                            </div>
                        </details>
                        <Group justify="flex-end" className="mcp-form-actions">
                            <Button variant="default" onClick={() => navigate('/connections/mcp')}>
                                Cancel
                            </Button>
                            <Button
                                disabled={!enabled || !valid}
                                loading={saving}
                                onClick={() => void issue()}
                            >
                                Create assistant credential
                            </Button>
                        </Group>
                    </Stack>
                </Card>
            )}
        </div>
    )
}
