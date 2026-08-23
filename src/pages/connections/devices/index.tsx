import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { IconArrowLeft, IconDeviceMobile, IconRefresh, IconX } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { confirmDevice, listDevices, rejectDevice, type DeviceRecord } from '../../../lib/deviceApi'

export function Devices() {
    const navigate = useNavigate()
    const [devices, setDevices] = useState<DeviceRecord[]>([])
    const [healthStatus, setHealthStatus] = useState<
        | 'Configured'
        | 'Connected'
        | 'Setup required'
        | 'Not configured'
        | 'Sync delayed'
        | 'Unavailable'
    >('Not configured')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const hasLoaded = useRef(false)
    const [pendingDeviceToReject, setPendingDeviceToReject] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const nextDevices = await listDevices()
            setDevices(nextDevices)

            const activeDevices = nextDevices.filter(d => d.status === 'active')
            const configuredDevices = nextDevices.filter(
                d => d.status === 'confirmed' && d.configuredAt !== null,
            )
            if (activeDevices.length > 0) {
                const latest = Math.max(
                    ...activeDevices.map(device =>
                        device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0,
                    ),
                )
                setHealthStatus(
                    latest > 0 && Date.now() - latest > 24 * 60 * 60 * 1000
                        ? 'Sync delayed'
                        : 'Connected',
                )
            } else if (configuredDevices.length > 0) {
                setHealthStatus('Configured')
            } else if (nextDevices.some(d => d.status === 'pending')) {
                setHealthStatus('Setup required')
            } else {
                setHealthStatus('Not configured')
            }
        } catch {
            setError('Devices unavailable')
            setHealthStatus('Unavailable')
        } finally {
            setLoading(false)
        }
    }, [])

    const getStatusLabel = (status: string): string => {
        switch (status) {
            case 'pending':
                return 'Awaiting approval'
            case 'confirmed':
                return 'Setup incomplete'
            case 'active':
                return 'Connected'
            case 'revoked':
                return 'Disconnected'
            default:
                return status
        }
    }

    // Initial load
    useEffect(() => {
        if (!hasLoaded.current) {
            hasLoaded.current = true
            void refresh()
        }
    }, [refresh])

    const handleAddDevice = () => {
        navigate('/connections/devices/new')
    }

    const handleRevoke = async (id: string) => {
        try {
            const response = await fetch(`/api/devices/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
            })
            if (!response.ok) throw new Error('Could not revoke device')
            await refresh()
        } catch {
            setError('The device could not be disconnected. Try again.')
        }
    }

    const handleApprove = async (id: string) => {
        try {
            await confirmDevice(id)
            await refresh()
        } catch {
            setError('Could not approve device')
        }
    }

    const handleReject = async (id: string) => {
        try {
            await rejectDevice(id)
            setPendingDeviceToReject(null)
            await refresh()
        } catch {
            setError('Could not reject device')
            setPendingDeviceToReject(null)
        }
    }

    const activeDevices = devices.filter(d => d.status === 'active')
    const pendingDevices = devices.filter(d => d.status === 'pending')

    return (
        <div className="page-content devices-page">
            <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => navigate('/connections')}
                mb="md"
            >
                Back to Connections
            </Button>

            <Title order={1} mb="sm">
                Devices
            </Title>
            <Text c="dimmed" mb="xl">
                Manage your Android devices for Health Connect integration.
            </Text>

            {error && (
                <Alert color="orange" variant="light" mb="md">
                    {error}
                </Alert>
            )}

            {/* Add Device Button - only show when no pending devices */}
            {pendingDevices.length === 0 && (
                <Card withBorder padding="lg" radius="md" mb="md">
                    <Group justify="space-between" align="center">
                        <Group gap="md">
                            <div className="connection-icon green">
                                <IconDeviceMobile size={24} />
                            </div>
                            <Stack gap={2}>
                                <Text size="sm" fw={500}>
                                    Pair a new phone
                                </Text>
                                <Text size="xs" c="dimmed">
                                    Connect an Android device to sync Health Connect data.
                                </Text>
                            </Stack>
                        </Group>
                        <Button onClick={handleAddDevice} color="trackit">
                            Pair a new phone
                        </Button>
                    </Group>
                </Card>
            )}

            {/* Health Status Summary */}
            <Card withBorder padding="lg" radius="md" mb="md">
                <Group justify="space-between">
                    <Group>
                        <div
                            className={`connection-icon ${healthStatus === 'Connected' ? 'green' : healthStatus === 'Configured' ? 'green' : 'dark'}`}
                        >
                            <IconDeviceMobile size={24} />
                        </div>
                        <Stack gap={2}>
                            <Text size="sm" fw={500}>
                                Health Connect Status
                            </Text>
                            <Text size="xs" c="dimmed">
                                {healthStatus === 'Connected'
                                    ? `${activeDevices.length} device${activeDevices.length > 1 ? 's' : ''} actively syncing`
                                    : healthStatus === 'Configured'
                                      ? 'Devices configured, syncing pending'
                                      : healthStatus === 'Setup required'
                                        ? pendingDevices.length > 0
                                            ? `${pendingDevices.length} device${pendingDevices.length > 1 ? 's' : ''} awaiting approval`
                                            : 'No devices configured'
                                        : healthStatus === 'Sync delayed'
                                          ? 'The last upload is more than 24 hours old'
                                          : healthStatus === 'Not configured'
                                            ? 'No phone has been paired yet'
                                            : 'The server could not load device status'}
                            </Text>
                        </Stack>
                    </Group>
                    <Button
                        onClick={refresh}
                        variant="subtle"
                        size="sm"
                        leftSection={<IconRefresh size={14} />}
                        loading={loading}
                    >
                        Refresh
                    </Button>
                </Group>
            </Card>

            {/* Pending Device Approval */}
            {pendingDevices.length > 0 && (
                <Alert color="blue" variant="light" mb="md">
                    <Group justify="space-between" align="center">
                        <Text size="sm">
                            <Text fw={600}>
                                {pendingDevices.length} device{pendingDevices.length > 1 ? 's' : ''}{' '}
                                awaiting approval
                            </Text>
                        </Text>
                        <Group gap="sm">
                            <Button
                                variant="default"
                                size="sm"
                                leftSection={<IconX size={14} />}
                                onClick={() => {
                                    if (pendingDevices[0]) {
                                        setPendingDeviceToReject(pendingDevices[0].id)
                                    }
                                }}
                            >
                                Reject
                            </Button>
                            <Button
                                size="sm"
                                color="trackit"
                                onClick={() => {
                                    if (pendingDevices[0]) {
                                        handleApprove(pendingDevices[0].id)
                                    }
                                }}
                            >
                                Approve
                            </Button>
                        </Group>
                    </Group>
                </Alert>
            )}

            {/* Pending Device Rejection Confirmation */}
            {pendingDeviceToReject && (
                <Alert color="orange" variant="light" mb="md">
                    <Group justify="space-between" align="center">
                        <Text size="sm">
                            Reject this device? This will cancel the pairing request.
                        </Text>
                        <Group gap="sm">
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => setPendingDeviceToReject(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                color="orange"
                                size="sm"
                                onClick={() => handleReject(pendingDeviceToReject)}
                            >
                                Yes, reject
                            </Button>
                        </Group>
                    </Group>
                </Alert>
            )}

            {/* Your Devices */}
            {activeDevices.length > 0 && (
                <Card withBorder padding="lg" radius="md" mb="md">
                    <Group justify="space-between" mb="md">
                        <Text size="sm" fw={600}>
                            Your devices ({activeDevices.length})
                        </Text>
                    </Group>
                    <Stack gap="sm">
                        {activeDevices.map(device => (
                            <div
                                key={device.id}
                                style={{
                                    background: 'var(--mantine-color-green-0)',
                                    borderRadius: 'var(--mantine-radius-md)',
                                    padding: 'var(--mantine-spacing-sm)',
                                }}
                            >
                                <Group justify="space-between" wrap="nowrap" align="center">
                                    <Stack gap={2} flex={1}>
                                        <Group gap="xs" align="center">
                                            <Text fw={600} size="sm">
                                                {device.name}
                                            </Text>
                                            <Badge size="sm" variant="light" color="green">
                                                {getStatusLabel(device.status)}
                                            </Badge>
                                        </Group>
                                        <Text size="xs" c="dimmed">
                                            {device.lastSeenAt
                                                ? `Last sync: ${new Date(device.lastSeenAt).toLocaleString()}`
                                                : 'Never synced'}
                                        </Text>
                                        {device.sync.length > 0 && (
                                            <div className="sync-diagnostics">
                                                {device.sync.map(cursor => (
                                                    <div key={cursor.recordType}>
                                                        <Badge
                                                            size="xs"
                                                            color={
                                                                cursor.status === 'ok'
                                                                    ? 'teal'
                                                                    : cursor.status === 'idle'
                                                                      ? 'gray'
                                                                      : 'orange'
                                                            }
                                                        >
                                                            {cursor.status}
                                                        </Badge>
                                                        <Text size="xs">
                                                            {cursor.recordType.replaceAll('_', ' ')}{' '}
                                                            Â·{' '}
                                                            {cursor.lastSyncedAt
                                                                ? `last received ${new Date(cursor.lastSyncedAt).toLocaleString()}`
                                                                : 'not received yet'}
                                                        </Text>
                                                        {cursor.diagnostic && (
                                                            <Text size="xs" c="orange">
                                                                {cursor.diagnostic}
                                                            </Text>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Stack>
                                    <Button
                                        size="compact-sm"
                                        variant="default"
                                        color="gray"
                                        onClick={() => handleRevoke(device.id)}
                                    >
                                        Disconnect
                                    </Button>
                                </Group>
                            </div>
                        ))}
                    </Stack>
                </Card>
            )}

            {/* No Devices State */}
            {devices.length === 0 && (
                <Card withBorder padding="xl" radius="md" ta="center">
                    <div style={{ marginBottom: 'var(--mantine-spacing-md)' }}>
                        <IconDeviceMobile size={48} color="dimmed" />
                    </div>
                    <Text size="lg" fw={500}>
                        No devices connected
                    </Text>
                    <Text size="sm" c="dimmed" mb="md">
                        Pair your first Android device to start syncing Health Connect data.
                    </Text>
                    <Button onClick={handleAddDevice} color="trackit">
                        Pair a phone
                    </Button>
                </Card>
            )}
        </div>
    )
}
