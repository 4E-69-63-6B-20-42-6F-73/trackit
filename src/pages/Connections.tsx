import { useState } from 'react'
import { Badge, Button, Modal, Stack, Switch, Text, TextInput } from '@mantine/core'
import {
    IconArrowDownRight,
    IconChevronRight,
    IconCircleCheck,
    IconDatabase,
    IconDeviceMobile,
    IconTools,
} from '@tabler/icons-react'
import type { JournalEvent } from '../domain/types'

export function Connections({ events }: { events: JournalEvent[] }) {
    const [dialog, setDialog] = useState<'health' | 'mcp' | 'export' | null>(null)
    const [mcp, setMcp] = useState(() => localStorage.getItem('trackit-mcp') === 'true')
    const toggleMcp = (value: boolean) => {
        setMcp(value)
        localStorage.setItem('trackit-mcp', String(value))
    }
    const exportData = () => {
        const blob = new Blob(
            [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), events }, null, 2)],
            { type: 'application/json' },
        )
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'trackit-export.json'
        link.click()
        URL.revokeObjectURL(url)
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
                                color={status === 'Enabled' || i === 2 ? 'teal' : 'gray'}
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
                                color="teal"
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
                <Stack>
                    <Text size="sm">
                        Health Connect is stored on your Android device. Pairing requires the
                        TrackIt Android companion, which will be built in the next platform phase.
                    </Text>
                    <Button disabled>Generate pairing code</Button>
                </Stack>
            </Modal>
            <Modal
                opened={dialog === 'mcp'}
                onClose={() => setDialog(null)}
                title="MCP server"
                centered
            >
                <Stack>
                    <Text size="sm" c="dimmed">
                        Expose read-only health tools to explicitly authorized MCP clients. No token
                        is issued until the server backend is configured.
                    </Text>
                    <Switch
                        checked={mcp}
                        onChange={e => toggleMcp(e.currentTarget.checked)}
                        label="Enable MCP endpoint"
                        description="Read-only by default"
                    />
                    <TextInput
                        readOnly
                        value={
                            mcp ? 'http://localhost:3000/mcp' : 'Enable the endpoint to see its URL'
                        }
                        label="Endpoint"
                    />
                </Stack>
            </Modal>
            <Modal
                opened={dialog === 'export'}
                onClose={() => setDialog(null)}
                title="Your data"
                centered
            >
                <Stack>
                    <Text size="sm" c="dimmed">
                        Download a portable JSON copy of all journal records currently stored in
                        this browser.
                    </Text>
                    <Button onClick={exportData} leftSection={<IconArrowDownRight size={17} />}>
                        Download JSON export
                    </Button>
                </Stack>
            </Modal>
        </div>
    )
}
