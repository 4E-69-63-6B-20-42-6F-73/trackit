import { ActionIcon, Text } from '@mantine/core'
import { IconActivity, IconLayoutSidebarLeftCollapse, IconSettings } from '@tabler/icons-react'
import { nav } from '../domain/data'
import type { Page } from '../domain/types'

export function Sidebar({
    page,
    setPage,
    collapsed,
    toggle,
}: {
    page: Page
    setPage: (p: Page) => void
    collapsed: boolean
    toggle: () => void
}) {
    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="brand">
                <div className="brand-mark">
                    <IconActivity size={22} />
                </div>
                {!collapsed && (
                    <>
                        <span>track</span>
                        <strong>it</strong>
                    </>
                )}
                <ActionIcon
                    className="collapse"
                    variant="subtle"
                    color="gray"
                    onClick={toggle}
                    aria-label="Collapse sidebar"
                >
                    <IconLayoutSidebarLeftCollapse size={18} />
                </ActionIcon>
            </div>
            <nav>
                {nav.map(({ label, icon: Icon }) => (
                    <button
                        className={`nav-item ${page === label ? 'active' : ''}`}
                        key={label}
                        onClick={() => setPage(label)}
                    >
                        <Icon size={20} stroke={1.7} />
                        {!collapsed && <span>{label}</span>}
                    </button>
                ))}
            </nav>
            <div className="sidebar-foot">
                <button
                    className={`nav-item ${page === 'Settings' ? 'active' : ''}`}
                    onClick={() => setPage('Settings')}
                >
                    <IconSettings size={20} />
                    {!collapsed && <span>Settings</span>}
                </button>
                <div className="profile">
                    <div className="avatar">NB</div>
                    {!collapsed && (
                        <div>
                            <Text size="sm" fw={600}>
                                Nick
                            </Text>
                            <Text size="xs" c="dimmed">
                                Local account
                            </Text>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    )
}
