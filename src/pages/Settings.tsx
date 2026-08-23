import { Button, Text } from '@mantine/core'
import {
    IconArrowLeft,
    IconChevronRight,
    IconDatabase,
    IconDashboard,
    IconSettings,
    IconShieldLock,
    IconUser,
} from '@tabler/icons-react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { BackupPanel } from '../components/BackupPanel'
import { ExperiencePanel } from '../components/ExperiencePanel'
import { PreferencesPanel } from '../components/PreferencesPanel'
import { PrivacyPanel } from '../components/PrivacyPanel'
import { SecurityPanel } from '../components/SecurityPanel'

const sections = [
    {
        slug: 'experience',
        title: 'Dashboard & reminders',
        description: 'Focus areas, routines and calm reminders',
        icon: IconDashboard,
        content: ExperiencePanel,
    },
    {
        slug: 'profile',
        title: 'Profile & units',
        description: 'Timezone, locale and measurement units',
        icon: IconUser,
        content: PreferencesPanel,
    },
    {
        slug: 'privacy',
        title: 'Privacy & retention',
        description: 'Data categories, retention and deletion',
        icon: IconDatabase,
        content: PrivacyPanel,
    },
    {
        slug: 'security',
        title: 'Security',
        description: 'Sessions and access history',
        icon: IconShieldLock,
        content: SecurityPanel,
    },
    {
        slug: 'system',
        title: 'System',
        description: 'Backups and restore verification',
        icon: IconSettings,
        content: BackupPanel,
    },
] as const

export function Settings() {
    const location = useLocation()
    const slug = location.pathname.split('/')[2] ?? ''
    const active = sections.find(section => section.slug === slug)
    const Content = active?.content
    const ActiveIcon = active?.icon

    return (
        <div className="page-content settings-page">
            <h1>Settings</h1>
            <Text className="subhead">
                Manage your TrackIt preferences, data, and installation.
            </Text>
            <div className={`settings-layout ${active ? 'has-active-settings' : ''}`}>
                <nav className="panel settings-navigation" aria-label="Settings sections">
                    {sections.map(({ slug: sectionSlug, title, description, icon: Icon }) => (
                        <NavLink
                            aria-current={active?.slug === sectionSlug ? 'page' : undefined}
                            className={active?.slug === sectionSlug ? 'active' : ''}
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
                {active && Content && ActiveIcon ? (
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
                                <h2 id="settings-detail-title">{active.title}</h2>
                                <Text size="sm" c="dimmed">
                                    {active.description}
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
                                : 'Each settings area has its own URL, so you can bookmark it and use the browser back button normally.'}
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
