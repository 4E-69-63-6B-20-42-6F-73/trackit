import { Button, Text } from '@mantine/core'
import {
    IconArrowLeft,
    IconChevronRight,
    IconDatabase,
    IconPlugConnected,
    IconShieldLock,
    IconSettings,
    IconUser,
} from '@tabler/icons-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { PreferencesPanel } from '../components/PreferencesPanel'
import { PrivacyPanel } from '../components/PrivacyPanel'
import { SecurityPanel } from '../components/SecurityPanel'
import { ConnectionsPanel } from './Connections'
import { PageHeader } from '../components/PageHeader'

const sections = [
    {
        slug: 'profile',
        title: 'Profile',
        description: 'Display name, timezone, and locale',
        icon: IconUser,
        content: PreferencesPanel,
    },
    {
        slug: 'connections',
        title: 'Connections',
        description: 'Health Connect, devices, and MCP access',
        icon: IconPlugConnected,
        content: ConnectionsPanel,
    },
    {
        slug: 'data',
        title: 'Data',
        description: 'Export, projection maintenance, and deletion',
        icon: IconDatabase,
        content: PrivacyPanel,
    },
    {
        slug: 'security',
        title: 'Security',
        description: 'Authentication, sessions, recovery, and access history',
        icon: IconShieldLock,
        content: SecurityPanel,
    },
] as const

export function Settings() {
    const location = useLocation()
    const slug = location.pathname.split('/')[2] ?? ''
    const active = sections.find(section => section.slug === slug)
    const displayed = active ?? (!slug ? sections[0] : undefined)
    const Content = displayed?.content
    const ActiveIcon = displayed?.icon

    return (
        <div className="page-content settings-page">
            <PageHeader
                title="Settings"
                description="Manage your TrackIt profile, connections, data, and security."
            />
            <div className={`settings-layout ${active ? 'has-active-settings' : ''}`}>
                <nav className="panel settings-navigation" aria-label="Settings sections">
                    {sections.map(({ slug: sectionSlug, title, description, icon: Icon }) => (
                        <NavLink
                            aria-current={displayed?.slug === sectionSlug ? 'page' : undefined}
                            className={displayed?.slug === sectionSlug ? 'active' : ''}
                            to={`/settings/${sectionSlug}`}
                            key={sectionSlug}
                        >
                            <div className="settings-icon">
                                <Icon size={19} />
                            </div>
                            <div>
                                <Text fw={600}>{title}</Text>
                                <Text size="sm" c="dimmed">
                                    {description}
                                </Text>
                            </div>
                            <IconChevronRight size={18} />
                        </NavLink>
                    ))}
                </nav>
                {displayed && Content && ActiveIcon ? (
                    <section
                        className="panel settings-detail"
                        aria-labelledby="settings-detail-title"
                    >
                        <Button
                            component={Link}
                            to="/settings"
                            className="settings-back"
                            variant="subtle"
                            color="gray"
                            size="compact-sm"
                            leftSection={<IconArrowLeft size={16} />}
                        >
                            All settings
                        </Button>
                        <div className="settings-detail-heading">
                            <div className="settings-icon">
                                <ActiveIcon size={20} />
                            </div>
                            <div>
                                <h2 id="settings-detail-title">{displayed.title}</h2>
                                <Text size="sm" c="dimmed">
                                    {displayed.description}
                                </Text>
                            </div>
                        </div>
                        <Content />
                    </section>
                ) : (
                    <section className="panel settings-overview">
                        <IconSettings size={28} />
                        <h2>{slug ? 'Settings page not found' : 'Choose what to manage'}</h2>
                        <Text size="sm" c="dimmed">
                            {slug
                                ? 'This settings address does not exist. Choose a section or return to the settings overview.'
                                : 'Profile, connections, data ownership, and security live here. Domain libraries and metric definitions live in Library.'}
                        </Text>
                        {slug && (
                            <Button component={Link} to="/settings" variant="default">
                                Return to settings
                            </Button>
                        )}
                    </section>
                )}
            </div>
        </div>
    )
}
