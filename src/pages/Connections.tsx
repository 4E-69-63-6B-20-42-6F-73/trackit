import { Badge, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { IconChevronRight, IconCircleCheck, IconDeviceMobile, IconTools } from '@tabler/icons-react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { healthConnectStatus, listDevices } from '../lib/deviceApi'
import { getMcpStatus } from '../lib/mcpApi'
import { serverQueryKeys } from '../lib/serverQueries'

export function ConnectionsPanel() {
    const navigate = useNavigate()
    const devicesQuery = useQuery({
        queryKey: serverQueryKeys.devices,
        queryFn: () => listDevices(),
    })
    const mcpQuery = useQuery({
        queryKey: serverQueryKeys.mcpStatus,
        queryFn: () => getMcpStatus(),
    })
    const devices = devicesQuery.data ?? []
    const healthStatus = devicesQuery.isPending
        ? 'Checking…'
        : devicesQuery.isError
          ? 'Unavailable'
          : healthConnectStatus(devices)
    const mcpStatus = mcpQuery.isPending
        ? 'Checking…'
        : mcpQuery.isError
          ? 'Unavailable'
          : mcpQuery.data.enabled
            ? 'Enabled'
            : 'Disabled'
    const deviceCount = devices.length

    const cards = [
        {
            key: 'health' as const,
            icon: IconDeviceMobile,
            title: 'Health Connect',
            status: healthStatus,
            desc: 'Receive health observations securely from paired Android devices.',
            color: 'green',
        },
        {
            key: 'mcp' as const,
            icon: IconTools,
            title: 'MCP server',
            status: mcpStatus,
            desc: 'Give compatible assistants scoped, auditable access to selected TrackIt capabilities.',
            color: 'violet',
        },
    ]

    return (
        <>
            <div className="connection-grid">
                {cards.map(({ key, icon: Icon, title, status, desc, color }) => (
                    <button
                        type="button"
                        className="connection-card"
                        key={title}
                        onClick={() =>
                            navigate(
                                key === 'health'
                                    ? '/settings/connections/devices'
                                    : '/settings/connections/mcp',
                            )
                        }
                    >
                        <div className={`connection-icon ${color}`}>
                            <Icon size={24} />
                        </div>
                        <div className="connection-title">
                            <h2>{title}</h2>
                            <Badge
                                variant="light"
                                color={
                                    key === 'mcp'
                                        ? status === 'Enabled'
                                            ? 'trackit'
                                            : 'gray'
                                        : status === 'Up to date'
                                          ? 'trackit'
                                          : status === 'Delayed' || status === 'Device unreachable'
                                            ? 'orange'
                                            : status === 'Permission required'
                                              ? 'green'
                                              : 'dark'
                                }
                            >
                                {status}
                            </Badge>
                        </div>
                        <Text c="dimmed" size="sm">
                            {desc}
                        </Text>
                        <div className="connection-action">
                            <Text fw={650} c="trackit">
                                {key === 'health'
                                    ? healthStatus === 'Up to date' && deviceCount > 0
                                        ? `${deviceCount} device${deviceCount > 1 ? 's' : ''} configured`
                                        : healthStatus === 'Permission required'
                                          ? 'View devices'
                                          : healthStatus === 'Unavailable'
                                            ? 'Review Health Connect'
                                            : healthStatus === 'Delayed'
                                              ? 'Review delayed sync'
                                              : healthStatus === 'Authentication failed'
                                                ? 'Reconnect this device'
                                                : healthStatus === 'Device unreachable'
                                                  ? 'Check this device'
                                                  : healthStatus === 'Syncing'
                                                    ? 'Sync in progress'
                                                    : healthStatus === 'Connected'
                                                      ? 'Waiting for first sync'
                                                      : healthStatus === 'Checking…'
                                                        ? 'Checking devices'
                                                        : 'Connect device'
                                    : mcpStatus === 'Checking…'
                                      ? 'Checking assistant access'
                                      : 'Manage assistants'}
                            </Text>
                            <IconChevronRight size={18} />
                        </div>
                    </button>
                ))}
            </div>
            <section className="privacy-note">
                <IconCircleCheck size={22} />
                <div>
                    <Text fw={650}>Private by default</Text>
                    <Text size="sm" c="dimmed">
                        TrackIt sends nothing to third parties unless you explicitly configure a
                        connection.
                    </Text>
                </div>
            </section>
            <Stack mt="lg" gap={0}>
                <Text size="sm" c="dimmed">
                    Export and deletion controls are available under Settings → Data.
                </Text>
            </Stack>
        </>
    )
}

export function Connections() {
    return (
        <div className="page-content connections-page">
            <PageHeader
                title="Connections"
                description="Manage where observations come from and which trusted clients can access TrackIt."
            />
            <ConnectionsPanel />
        </div>
    )
}
