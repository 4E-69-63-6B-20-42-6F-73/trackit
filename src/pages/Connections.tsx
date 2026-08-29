import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Stack, Text } from '@mantine/core'
import {
    IconChevronRight,
    IconCircleCheck,
    IconDeviceMobile,
    IconTools,
} from '@tabler/icons-react'
import { PageHeader } from '../components/PageHeader'
import { healthConnectStatus, listDevices, type HealthConnectStatus } from '../lib/deviceApi'
import { getMcpStatus } from '../lib/mcpApi'

export function ConnectionsPanel() {
    const navigate = useNavigate()
    const [mcp, setMcp] = useState(false)
    const [healthStatus, setHealthStatus] = useState<HealthConnectStatus | 'Unavailable'>(
        'Not connected',
    )
    const [deviceCount, setDeviceCount] = useState(0)
    const refreshHealthStatus = useCallback(() => {
        void listDevices()
            .then(devices => {
                setHealthStatus(healthConnectStatus(devices))
                setDeviceCount(devices.length)
            })
            .catch(() => setHealthStatus('Unavailable'))
    }, [])
    useEffect(refreshHealthStatus, [refreshHealthStatus])
    useEffect(() => {
        void getMcpStatus()
            .then(status => setMcp(status.enabled))
            .catch(() => setMcp(false))
    }, [])

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
            status: mcp ? 'Enabled' : 'Disabled',
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
                            navigate(key === 'health' ? '/connections/devices' : '/connections/mcp')
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
                                        ? mcp
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
                                                      : 'Connect device'
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
