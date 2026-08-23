import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { IconArrowLeft, IconDeviceMobile, IconRefresh, IconX } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import {
    confirmDevice,
    healthConnectStatus,
    listDevices,
    rejectDevice,
    revokeDevice,
    type DeviceRecord,
    type HealthConnectStatus,
} from '../../../lib/deviceApi'

export function Devices() {
    const navigate = useNavigate()
    const [devices, setDevices] = useState<DeviceRecord[]>([])
    const [healthStatus, setHealthStatus] = useState<HealthConnectStatus | 'Unavailable'>(
        'Not connected',
    )
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const hasLoaded = useRef(false)
    const [pendingDeviceToReject, setPendingDeviceToReject] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const nextDevices = await listDevices()
            setDevices(nextDevices)

            setHealthStatus(healthConnectStatus(nextDevices))
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
            await revokeDevice(id)
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

    const getStatusColor = (status: string): string => {
        switch (status) {
            case 'active':
                return 'green'
            case 'pending':
                return 'blue'
            case 'confirmed':
                return 'orange'
            default:
                return 'gray'
        }
    }

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
                            className={`connection-icon ${healthStatus === 'Up to date' ? 'green' : healthStatus === 'Permission required' ? 'amber' : 'dark'}`}
                        >
                            <IconDeviceMobile size={24} />
                        </div>
                        <Stack gap={2}>
                            <Text size="sm" fw={500}>
                                Health Connect Status
                            </Text>
                            <Text size="xs" c="dimmed">
                                {healthStatus === 'Up to date'
                                    ? `${activeDevices.length} device${activeDevices.length > 1 ? 's' : ''} actively syncing`
                                    : healthStatus === 'Connected'
                                      ? 'Connected and waiting for the first Health Connect upload'
                                      : healthStatus === 'Syncing'
                                        ? 'A Health Connect upload is currently in progress'
                                        : healthStatus === 'Authentication failed'
                                          ? 'Authentication failed; reconnect the phone to renew access'
                                          : healthStatus === 'Device unreachable'
                                            ? 'No upload has arrived for more than seven days; check the phone'
                                            : healthStatus === 'Permission required'
                                              ? pendingDevices.length > 0
                                                  ? `${pendingDevices.length} device${pendingDevices.length > 1 ? 's' : ''} awaiting approval`
                                                  : 'No devices configured'
                                              : healthStatus === 'Delayed'
                                                ? 'The last upload is more than 24 hours old'
                                                : healthStatus === 'Not connected'
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
            {devices.length > 0 && (
                <Card withBorder padding="lg" radius="md" mb="md">
                    <Group justify="space-between" mb="md">
                        <Text size="sm" fw={600}>
                            Your devices ({devices.length})
                        </Text>
                    </Group>
                    <Stack gap="sm">
                        {devices.map(device => (
                            <div
                                key={device.id}
                                style={{
                                    background: `var(--mantine-color-${getStatusColor(device.status)}-0)`,
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
                                            <Badge
                                                size="sm"
                                                variant="light"
                                                color={getStatusColor(device.status)}
                                            >
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
                                    {device.status === 'pending' && (
                                        <Group gap="xs" wrap="nowrap">
                                            <Button
                                                size="compact-sm"
                                                variant="default"
                                                leftSection={<IconX size={14} />}
                                                onClick={() => setPendingDeviceToReject(device.id)}
                                            >
                                                Reject
                                            </Button>
                                            <Button
                                                size="compact-sm"
                                                color="trackit"
                                                onClick={() => handleApprove(device.id)}
                                            >
                                                Approve
                                            </Button>
                                        </Group>
                                    )}
                                    {device.status === 'active' && (
                                        <Button
                                            size="compact-sm"
                                            variant="default"
                                            color="gray"
                                            onClick={() => handleRevoke(device.id)}
                                        >
                                            Disconnect
                                        </Button>
                                    )}
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
