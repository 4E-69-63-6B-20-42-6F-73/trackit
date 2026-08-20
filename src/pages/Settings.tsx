import { useState } from 'react'
import { Button, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core'
import {
    IconChevronRight,
    IconDatabase,
    IconSettings,
    IconTrendingUp,
    IconUser,
} from '@tabler/icons-react'

export function Settings() {
    const [active, setActive] = useState<string | null>(null)
    const options = [
        ['Profile & units', 'Timezone, locale and measurement units', IconUser],
        ['Goals', 'Optional daily targets and ranges', IconTrendingUp],
        ['Privacy & retention', 'Data categories, retention and deletion', IconDatabase],
        ['System', 'Backups, updates and diagnostics', IconSettings],
    ] as const
    return (
        <div className="page-content simple-page">
            <Text className="date">PREFERENCES</Text>
            <h1>Settings</h1>
            <Text className="subhead">Make TrackIt feel like yours.</Text>
            <section className="panel settings-list">
                {options.map(([title, desc, Icon]) => (
                    <button onClick={() => setActive(title)} key={title}>
                        <div className="settings-icon">
                            <Icon size={19} />
                        </div>
                        <div>
                            <Text fw={600}>{title}</Text>
                            <Text size="sm" c="dimmed">
                                {desc}
                            </Text>
                        </div>
                        <IconChevronRight size={18} />
                    </button>
                ))}
            </section>
            <Modal opened={!!active} onClose={() => setActive(null)} title={active} centered>
                <Stack>
                    {active === 'Profile & units' ? (
                        <>
                            <TextInput label="Display name" defaultValue="Nick" />
                            <Select
                                label="Units"
                                defaultValue="Metric"
                                data={['Metric', 'Imperial']}
                            />
                            <Select
                                label="Timezone"
                                defaultValue="Europe/Amsterdam"
                                data={['Europe/Amsterdam', 'UTC', 'America/New_York']}
                            />
                        </>
                    ) : active === 'Goals' ? (
                        <>
                            <NumberInput label="Daily steps" defaultValue={10000} />
                            <NumberInput label="Water" defaultValue={2400} suffix=" ml" />
                            <NumberInput label="Protein" defaultValue={115} suffix=" g" />
                        </>
                    ) : (
                        <Text size="sm" c="dimmed">
                            This control will be connected to the self-hosted server configuration
                            in the backend phase.
                        </Text>
                    )}
                    <Button onClick={() => setActive(null)}>Save changes</Button>
                </Stack>
            </Modal>
        </div>
    )
}
