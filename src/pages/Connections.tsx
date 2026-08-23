import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Badge, Button, Modal, Stack, Text } from '@mantine/core'
import {
    IconArrowDownRight,
    IconChevronRight,
    IconCircleCheck,
    IconDatabase,
    IconDeviceMobile,
    IconTools,
} from '@tabler/icons-react'
import { McpPanel } from '../components/McpPanel'
import { PageHeader } from '../components/PageHeader'
import { downloadExport } from '../lib/lifecycleApi'
import { healthConnectStatus, listDevices, type HealthConnectStatus } from '../lib/deviceApi'

export function Connections() {
    const navigate = useNavigate()
    const [dialog, setDialog] = useState<'mcp' | 'export' | null>(null)
    const [mcp, setMcp] = useState(false)
    const [exportError, setExportError] = useState('')
    const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
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
    const exportData = async (format: 'json' | 'csv') => {
        setExporting(format)
        setExportError('')
        try {
            await downloadExport(format)
        } catch {
            setExportError('The export could not be downloaded. Try again.')
        } finally {
            setExporting(null)
        }
    }
    const cards = [
        {
            key: 'health' as const,
            icon: IconDeviceMobile,
            title: 'Health Connect',
            status: healthStatus,
            desc: 'Sync sleep, activity, heart rate and body measurements securely from Android.',
            color: 'green',
        },
        {
            key: 'mcp' as const,
            icon: IconTools,
            title: 'MCP server',
            status: mcp ? 'Connected' : 'Not connected',
            desc: 'Let compatible assistants query selected health data through scoped, auditable access.',
            color: 'violet',
        },
        {
            key: 'export' as const,
            icon: IconDatabase,
            title: 'Export your data',
            status: null,
            desc: 'Download a portable copy of your TrackIt data for backup or migration.',
            color: 'blue',
        },
    ]
    return (
        <div className="page-content connections-page">
            <PageHeader
                title="Connections"
                description="You decide what comes in, what goes out, and who can see it."
            />
            <div className="connection-grid connection-grid-primary">
                {cards
                    .filter(card => card.key !== 'mcp')
                    .map(({ key, icon: Icon, title, status, desc, color }) => (
                        <button
                            type="button"
                            className="connection-card"
                            key={title}
                            onClick={
                                key === 'health'
                                    ? () => navigate('/connections/devices')
                                    : () => setDialog(key)
                            }
                        >
                            <div className={`connection-icon ${color}`}>
                                <Icon size={24} />
                            </div>
                            <div className="connection-title">
                                <h2>{title}</h2>
                                {status && (
                                    <Badge
                                        variant="light"
                                        color={
                                            status === 'Up to date'
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
                                )}
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
                                        : 'Export data'}
                                </Text>
                                <IconChevronRight size={18} />
                            </div>
                        </button>
                    ))}
            </div>
            <section className="connections-advanced">
                <div>
                    <Text fw={700}>Advanced and developer access</Text>
                    <Text size="sm" c="dimmed">
                        Optional tools for connecting compatible assistants to selected TrackIt
                        data.
                    </Text>
                </div>
                {cards
                    .filter(card => card.key === 'mcp')
                    .map(({ key, icon: Icon, title, status, desc, color }) => (
                        <article className="connection-card connection-card-compact" key={title}>
                            <div className={`connection-icon ${color}`}>
                                <Icon size={22} />
                            </div>
                            <div>
                                <div className="connection-title">
                                    <h2>{title}</h2>
                                    <Badge variant="light" color={mcp ? 'trackit' : 'gray'}>
                                        {status}
                                    </Badge>
                                </div>
                                <Text c="dimmed" size="sm">
                                    {desc}
                                </Text>
                            </div>
                            <Button variant="default" onClick={() => setDialog(key)}>
                                Manage MCP access
                            </Button>
                        </article>
                    ))}
            </section>
            <section className="privacy-note">
                <IconCircleCheck size={22} />
                <div>
                    <Text fw={650}>Private by default</Text>
                    <Text size="sm" c="dimmed">
                        TrackIt has no telemetry and sends nothing to third parties unless you
                        explicitly connect it.
                    </Text>
                </div>
            </section>
            <Modal
                opened={dialog === 'mcp'}
                onClose={() => setDialog(null)}
                title="MCP server"
                centered
            >
                <McpPanel onEnabledChange={setMcp} />
            </Modal>
            <Modal
                opened={dialog === 'export'}
                onClose={() => setDialog(null)}
                title="Export your data"
                centered
            >
                <Stack>
                    <Text size="sm" c="dimmed">
                        Download a versioned copy of your journal, health, nutrition, goals, and
                        preferences. Your server prepares the file when you request it.
                    </Text>
                    <Button
                        loading={exporting === 'json'}
                        onClick={() => void exportData('json')}
                        leftSection={<IconArrowDownRight size={17} />}
                    >
                        Download JSON export
                    </Button>
                    <Button
                        variant="default"
                        loading={exporting === 'csv'}
                        onClick={() => void exportData('csv')}
                    >
                        Download CSV export
                    </Button>
                    {exportError && <Alert color="orange">{exportError}</Alert>}
                </Stack>
            </Modal>
        </div>
    )
}
