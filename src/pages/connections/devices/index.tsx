import { useMemo, useState } from 'react'
import {
    ActionIcon,
    Alert,
    Badge,
    Button,
    Card,
    Group,
    Menu,
    Modal,
    Stack,
    Text,
    Title,
} from '@mantine/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    IconArrowLeft,
    IconChevronRight,
    IconDeviceMobile,
    IconDots,
    IconPlus,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import {
    confirmDevice,
    deleteDevice,
    healthConnectStatus,
    listDevices,
    rejectDevice,
    revokeDevice,
    type DeviceRecord,
} from '../../../lib/deviceApi'
import { serverQueryKeys } from '../../../lib/serverQueries'

const statusLabel = (status: string) => {
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

const statusColor = (status: string) => {
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

const statusOrder: Record<string, number> = { pending: 0, confirmed: 1, active: 2, revoked: 3 }
const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString() : 'Not available'
const relativeDate = (value: string) => {
    const elapsed = new Date(value).getTime() - Date.now()
    const minutes = Math.round(elapsed / 60_000)
    if (Math.abs(minutes) < 60)
        return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(minutes, 'minute')
    const hours = Math.round(elapsed / 3_600_000)
    if (Math.abs(hours) < 24)
        return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(hours, 'hour')
    const days = Math.round(elapsed / 86_400_000)
    return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(days, 'day')
}

type DeviceAction = 'approve' | 'reject' | 'disconnect' | 'delete'

export function Devices() {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [actionError, setActionError] = useState('')
    const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null)
    const [confirmation, setConfirmation] = useState<{
        device: DeviceRecord
        action: 'reject' | 'disconnect' | 'delete'
    } | null>(null)
    const devicesQuery = useQuery({
        queryKey: serverQueryKeys.devices,
        queryFn: ({ signal }) => listDevices(signal),
    })
    const devices = devicesQuery.data ?? []
    const loading = devicesQuery.isPending
    const healthStatus = devicesQuery.isError ? 'Unavailable' : healthConnectStatus(devices)
    const error = devicesQuery.isError
        ? 'Devices unavailable. Try refreshing the list.'
        : actionError
    const deviceMutation = useMutation({
        mutationFn: async ({ device, action }: { device: DeviceRecord; action: DeviceAction }) => {
            if (action === 'approve') await confirmDevice(device.id)
            else if (action === 'reject') await rejectDevice(device.id)
            else if (action === 'disconnect') await revokeDevice(device.id)
            else await deleteDevice(device.id)
        },
        onMutate: () => setActionError(''),
        onSuccess: async (_, { action }) => {
            if (action !== 'approve') {
                setConfirmation(null)
                setSelectedDevice(null)
            }
            await queryClient.invalidateQueries({ queryKey: serverQueryKeys.devices })
        },
        onError: (_, { device, action }) => {
            setActionError(
                action === 'approve'
                    ? `Could not approve ${device.name}. Try again.`
                    : action === 'reject'
                      ? `Could not reject ${device.name}. Try again.`
                      : action === 'disconnect'
                        ? `Could not disconnect ${device.name}. Try again.`
                        : `Could not delete ${device.name}. Try again.`,
            )
        },
    })
    const busyDeviceId = deviceMutation.isPending ? deviceMutation.variables?.device.id : null

    const orderedDevices = useMemo(
        () =>
            [...devices].sort(
                (left, right) =>
                    (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99) ||
                    right.createdAt.localeCompare(left.createdAt),
            ),
        [devices],
    )
    const currentDevices = orderedDevices.filter(device => device.status !== 'revoked')
    const pastDevices = orderedDevices.filter(device => device.status === 'revoked')
    const activeCount = devices.filter(device => device.status === 'active').length
    const attentionCount = devices.filter(device =>
        ['pending', 'confirmed'].includes(device.status),
    ).length
    const hasPendingDevice = devices.some(device => device.status === 'pending')

    const healthSummary = (() => {
        if (healthStatus === 'Unavailable')
            return { tone: 'gray', text: 'Device status is unavailable' }
        if (attentionCount > 0)
            return {
                tone: 'amber',
                text: `${attentionCount} device${attentionCount === 1 ? '' : 's'} need${attentionCount === 1 ? 's' : ''} attention`,
            }
        if (activeCount > 0) {
            const healthy = healthStatus === 'Up to date'
            return {
                tone: healthy ? 'green' : 'amber',
                text: healthy
                    ? `${activeCount} device${activeCount === 1 ? '' : 's'} syncing normally`
                    : `${activeCount} connected device${activeCount === 1 ? '' : 's'} · ${healthStatus}`,
            }
        }
        return { tone: 'gray', text: 'No active devices' }
    })()

    const runConfirmedAction = () => {
        if (!confirmation) return
        deviceMutation.mutate({ device: confirmation.device, action: confirmation.action })
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

            <Group className="devices-heading" justify="space-between" align="flex-end">
                <div>
                    <Title order={1} mb={4}>
                        Devices
                    </Title>
                    <Text c="dimmed">Manage Android devices that sync Health Connect data.</Text>
                </div>
                <Button
                    color="trackit"
                    leftSection={<IconPlus size={16} />}
                    onClick={() => navigate('/connections/devices/new')}
                    disabled={hasPendingDevice}
                    title={
                        hasPendingDevice
                            ? 'Approve or delete the pending request before pairing another device.'
                            : undefined
                    }
                >
                    Pair device
                </Button>
            </Group>
            {hasPendingDevice && (
                <Text className="device-pairing-note" size="xs" c="dimmed">
                    Approve or delete the pending request before pairing another device.
                </Text>
            )}

            {error && (
                <Alert color="orange" variant="light" mt="lg">
                    {error}
                </Alert>
            )}

            <div className="device-health-summary" role="status">
                <span className={`device-health-dot ${healthSummary.tone}`} />
                <Text size="sm" fw={600}>
                    {healthSummary.text}
                </Text>
                <ActionIcon
                    ml="auto"
                    variant="subtle"
                    color="gray"
                    aria-label="Refresh devices"
                    loading={devicesQuery.isFetching}
                    onClick={() => void devicesQuery.refetch()}
                >
                    <IconRefresh size={17} />
                </ActionIcon>
            </div>

            {devices.length > 0 ? (
                <>
                    <Card className="device-list" withBorder padding={0} radius="md">
                        <Group className="device-list-heading" justify="space-between">
                            <Text size="sm" fw={700}>
                                Your devices
                            </Text>
                        </Group>
                        {currentDevices.map(device => (
                            <div
                                className={`device-row ${device.status === 'pending' ? 'device-row-pending' : ''}`}
                                key={device.id}
                                role={device.status === 'pending' ? undefined : 'button'}
                                tabIndex={device.status === 'pending' ? undefined : 0}
                                aria-label={
                                    device.status === 'pending'
                                        ? undefined
                                        : `View ${device.name} details`
                                }
                                onClick={() =>
                                    device.status !== 'pending' && setSelectedDevice(device)
                                }
                                onKeyDown={event => {
                                    if (
                                        device.status !== 'pending' &&
                                        (event.key === 'Enter' || event.key === ' ')
                                    ) {
                                        event.preventDefault()
                                        setSelectedDevice(device)
                                    }
                                }}
                            >
                                <div className={`device-row-icon ${statusColor(device.status)}`}>
                                    <IconDeviceMobile size={19} />
                                </div>
                                <div className="device-row-copy">
                                    <Group gap="xs">
                                        <Text fw={650}>{device.name}</Text>
                                        <Badge
                                            size="sm"
                                            variant="light"
                                            color={statusColor(device.status)}
                                        >
                                            {statusLabel(device.status)}
                                        </Badge>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        {device.lastSeenAt
                                            ? `Synced ${relativeDate(device.lastSeenAt)}`
                                            : device.status === 'pending'
                                              ? 'Waiting for your approval'
                                              : 'Never synced'}
                                    </Text>
                                </div>
                                {device.status === 'pending' && (
                                    <Button
                                        size="compact-sm"
                                        color="trackit"
                                        loading={busyDeviceId === device.id}
                                        onClick={event => {
                                            event.stopPropagation()
                                            deviceMutation.mutate({ device, action: 'approve' })
                                        }}
                                    >
                                        Approve
                                    </Button>
                                )}
                                <Menu position="bottom-end">
                                    <Menu.Target>
                                        <ActionIcon
                                            variant="subtle"
                                            color="gray"
                                            aria-label={`Actions for ${device.name}`}
                                            onClick={event => event.stopPropagation()}
                                        >
                                            <IconDots size={18} />
                                        </ActionIcon>
                                    </Menu.Target>
                                    <Menu.Dropdown onClick={event => event.stopPropagation()}>
                                        <Menu.Item onClick={() => setSelectedDevice(device)}>
                                            View details
                                        </Menu.Item>
                                        {device.status === 'active' && (
                                            <Menu.Item
                                                color="red"
                                                onClick={() =>
                                                    setConfirmation({
                                                        device,
                                                        action: 'disconnect',
                                                    })
                                                }
                                            >
                                                Disconnect
                                            </Menu.Item>
                                        )}
                                        <Menu.Item
                                            color="red"
                                            leftSection={<IconTrash size={15} />}
                                            onClick={() =>
                                                setConfirmation({ device, action: 'delete' })
                                            }
                                        >
                                            Delete device
                                        </Menu.Item>
                                    </Menu.Dropdown>
                                </Menu>
                                {device.status !== 'pending' && (
                                    <IconChevronRight className="device-row-chevron" size={17} />
                                )}
                            </div>
                        ))}
                    </Card>
                    {pastDevices.length > 0 && (
                        <details className="past-device-list">
                            <summary>Past devices ({pastDevices.length})</summary>
                            <Card className="device-list" withBorder padding={0} radius="md">
                                {pastDevices.map(device => (
                                    <div className="device-row device-row-past" key={device.id}>
                                        <div className="device-row-icon">
                                            <IconDeviceMobile size={19} />
                                        </div>
                                        <div className="device-row-copy">
                                            <Group gap="xs">
                                                <Text fw={650}>{device.name}</Text>
                                                <Badge size="sm" variant="light" color="gray">
                                                    Disconnected
                                                </Badge>
                                            </Group>
                                            <Text size="xs" c="dimmed">
                                                Disconnected device
                                            </Text>
                                        </div>
                                        <Button
                                            variant="subtle"
                                            color="red"
                                            size="compact-sm"
                                            onClick={() =>
                                                setConfirmation({ device, action: 'delete' })
                                            }
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                ))}
                            </Card>
                        </details>
                    )}
                </>
            ) : (
                !loading && (
                    <Card className="device-empty" withBorder padding="xl" radius="md" ta="center">
                        <IconDeviceMobile size={38} />
                        <Text fw={650}>No devices paired</Text>
                        <Text size="sm" c="dimmed">
                            Pair an Android device to start syncing Health Connect data.
                        </Text>
                        <Button
                            mt="sm"
                            color="trackit"
                            onClick={() => navigate('/connections/devices/new')}
                        >
                            Pair your first device
                        </Button>
                    </Card>
                )
            )}

            <Modal
                opened={Boolean(selectedDevice)}
                onClose={() => setSelectedDevice(null)}
                title={selectedDevice?.name ?? 'Device details'}
                size="md"
            >
                {selectedDevice && (
                    <Stack gap="md">
                        <Group gap="xs">
                            <Badge color={statusColor(selectedDevice.status)} variant="light">
                                {statusLabel(selectedDevice.status)}
                            </Badge>
                            <Text size="sm" c="dimmed">
                                Last sync: {formatDate(selectedDevice.lastSeenAt)}
                            </Text>
                        </Group>
                        <div className="device-detail-grid">
                            <div>
                                <Text size="xs" c="dimmed">
                                    Paired
                                </Text>
                                <Text size="sm">{formatDate(selectedDevice.createdAt)}</Text>
                            </div>
                            <div>
                                <Text size="xs" c="dimmed">
                                    Configured
                                </Text>
                                <Text size="sm">{formatDate(selectedDevice.configuredAt)}</Text>
                            </div>
                        </div>
                        <div>
                            <Text size="sm" fw={650} mb="xs">
                                Sync details
                            </Text>
                            {selectedDevice.sync.length > 0 ? (
                                <Stack className="device-sync-list" gap={0}>
                                    {selectedDevice.sync.map(cursor => (
                                        <div key={cursor.recordType}>
                                            <div>
                                                <Text size="sm" fw={600} tt="capitalize">
                                                    {cursor.recordType.replaceAll('_', ' ')}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {cursor.lastSyncedAt
                                                        ? `Last received ${new Date(cursor.lastSyncedAt).toLocaleString()}`
                                                        : 'No data received yet'}
                                                </Text>
                                                {cursor.diagnostic && (
                                                    <Text size="xs" c="orange">
                                                        {cursor.diagnostic}
                                                    </Text>
                                                )}
                                            </div>
                                            <Badge
                                                size="sm"
                                                variant="light"
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
                                        </div>
                                    ))}
                                </Stack>
                            ) : (
                                <Text size="sm" c="dimmed">
                                    No sync details available yet.
                                </Text>
                            )}
                        </div>
                        <details className="device-advanced">
                            <summary>Advanced details</summary>
                            <Text size="xs" c="dimmed" mt="xs">
                                Key fingerprint
                            </Text>
                            <Text size="xs" className="device-fingerprint">
                                {selectedDevice.keyFingerprint}
                            </Text>
                        </details>
                        <Group justify="flex-end">
                            <Button variant="default" onClick={() => setSelectedDevice(null)}>
                                Close
                            </Button>
                        </Group>
                    </Stack>
                )}
            </Modal>

            <Modal
                opened={Boolean(confirmation)}
                onClose={() => setConfirmation(null)}
                title={
                    confirmation?.action === 'reject'
                        ? 'Reject pairing?'
                        : confirmation?.action === 'disconnect'
                          ? 'Disconnect device?'
                          : 'Delete device?'
                }
                centered
                size="sm"
            >
                <Text size="sm">
                    {confirmation?.action === 'reject'
                        ? `Reject the pairing request from ${confirmation.device.name}?`
                        : confirmation?.action === 'disconnect'
                          ? `Disconnect ${confirmation.device.name}? It will no longer be able to sync health data.`
                          : `Permanently delete ${confirmation?.device.name}? Its saved connection and sync diagnostics will be removed.`}
                </Text>
                <Group justify="flex-end" mt="lg">
                    <Button variant="default" onClick={() => setConfirmation(null)}>
                        Cancel
                    </Button>
                    <Button
                        color="red"
                        loading={Boolean(confirmation && busyDeviceId === confirmation.device.id)}
                        onClick={runConfirmedAction}
                    >
                        {confirmation?.action === 'reject'
                            ? 'Reject pairing'
                            : confirmation?.action === 'disconnect'
                              ? 'Disconnect'
                              : 'Delete device'}
                    </Button>
                </Group>
            </Modal>
        </div>
    )
}
