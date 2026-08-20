import { useState } from 'react'
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
import { DevicePanel } from '../components/DevicePanel'
import { downloadExport } from '../lib/lifecycleApi'

export function Connections() {
    const [dialog, setDialog] = useState<'health' | 'mcp' | 'export' | null>(null)
    const [mcp, setMcp] = useState(false)
    const [exportError, setExportError] = useState('')
    const [exporting, setExporting] = useState<'json' | 'csv' | null>(null)
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
            status: 'Needs companion app',
            desc: 'Sync sleep, activity, heart rate and body measurements securely from Android.',
            color: 'green',
        },
        {
            key: 'mcp' as const,
            icon: IconTools,
            title: 'MCP server',
            status: mcp ? 'Enabled' : 'Disabled',
            desc: 'Let compatible assistants query selected health data through scoped, auditable access.',
            color: 'violet',
        },
        {
            key: 'export' as const,
            icon: IconDatabase,
            title: 'Import & export',
            status: 'Ready',
            desc: 'Bring in historical data or download a portable copy of everything you own.',
            color: 'blue',
        },
    ]
    return (
        <div className="page-content simple-page">
            <Text className="date">YOUR DATA</Text>
            <h1>Connections</h1>
            <Text className="subhead">
                You decide what comes in, what goes out, and who can see it.
            </Text>
            <div className="connection-grid">
                {cards.map(({ key, icon: Icon, title, status, desc, color }, i) => (
                    <article className="connection-card" key={title}>
                        <div className={`connection-icon ${color}`}>
                            <Icon size={24} />
                        </div>
                        <div className="connection-title">
                            <h2>{title}</h2>
                            <Badge
                                variant="light"
                                color={status === 'Enabled' || i === 2 ? 'trackit' : 'gray'}
                            >
                                {status}
                            </Badge>
                        </div>
                        <Text c="dimmed" size="sm">
                            {desc}
                        </Text>
                        <div className="connection-action">
                            <Button
                                onClick={() => setDialog(key)}
                                variant={i === 0 ? 'filled' : 'default'}
                                color="trackit"
                            >
                                {i === 0 ? 'Set up' : 'Manage'}
                            </Button>
                            <IconChevronRight size={18} />
                        </div>
                    </article>
                ))}
            </div>
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
                opened={dialog === 'health'}
                onClose={() => setDialog(null)}
                title="Health Connect"
                centered
            >
                <DevicePanel />
            </Modal>
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
                title="Your data"
                centered
            >
                <Stack>
                    <Text size="sm" c="dimmed">
                        Download a versioned portable copy of journal, health, nutrition, goals, and
                        preferences from your server.
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
