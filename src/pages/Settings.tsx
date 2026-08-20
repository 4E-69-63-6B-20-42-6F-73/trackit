import { useState } from 'react'
import { Modal, Stack, Text } from '@mantine/core'
import {
    IconChevronRight,
    IconDatabase,
    IconSettings,
    IconShieldLock,
    IconTrendingUp,
    IconUser,
} from '@tabler/icons-react'
import { SecurityPanel } from '../components/SecurityPanel'
import { GoalsPanel } from '../components/GoalsPanel'
import { BackupPanel } from '../components/BackupPanel'
import { PrivacyPanel } from '../components/PrivacyPanel'
import { PreferencesPanel } from '../components/PreferencesPanel'

export function Settings() {
    const [active, setActive] = useState<string | null>(null)
    const options = [
        ['Profile & units', 'Timezone, locale and measurement units', IconUser],
        ['Goals', 'Optional daily targets and ranges', IconTrendingUp],
        ['Privacy & retention', 'Data categories, retention and deletion', IconDatabase],
        ['Security', 'Passkeys, sessions and access history', IconShieldLock],
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
                        <PreferencesPanel onSaved={() => setActive(null)} />
                    ) : active === 'Goals' ? (
                        <GoalsPanel />
                    ) : active === 'Security' ? (
                        <SecurityPanel />
                    ) : active === 'Privacy & retention' ? (
                        <PrivacyPanel />
                    ) : active === 'System' ? (
                        <BackupPanel />
                    ) : (
                        <Text size="sm" c="dimmed">
                            This control will be connected to the self-hosted server configuration
                            in the backend phase.
                        </Text>
                    )}
                </Stack>
            </Modal>
        </div>
    )
}
