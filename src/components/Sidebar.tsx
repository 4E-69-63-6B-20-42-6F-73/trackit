import { ActionIcon } from '@mantine/core'
import { IconActivity, IconLayoutSidebarLeftCollapse, IconSettings } from '@tabler/icons-react'
import { NavLink } from 'react-router-dom'
import { nav } from '../domain/data'
import type { Page } from '@trackit/domain/types'

const paths: Partial<Record<Page, string>> = {
    Today: '/today',
    Plan: '/plan',
    Journal: '/journal',
    Trends: '/trends',
    Goals: '/goals',
    Library: '/library',
}

export function Sidebar({
    page,
    collapsed,
    toggle,
}: {
    page: Page
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
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <IconLayoutSidebarLeftCollapse size={18} />
                </ActionIcon>
            </div>
            <nav aria-label="Primary navigation">
                <div className="nav-group">
                    {nav.map(({ label, icon: Icon }) => (
                        <NavLink
                            aria-label={label}
                            aria-current={page === label ? 'page' : undefined}
                            className={`nav-item ${page === label ? 'active' : ''}`}
                            key={label}
                            to={paths[label] ?? '/today'}
                        >
                            <Icon size={20} stroke={1.7} />
                            {!collapsed && <span>{label}</span>}
                        </NavLink>
                    ))}
                </div>
            </nav>
            <div className="sidebar-foot">
                <NavLink
                    aria-label="Settings"
                    aria-current={page === 'Settings' ? 'page' : undefined}
                    className={`nav-item ${page === 'Settings' ? 'active' : ''}`}
                    to="/settings"
                >
                    <IconSettings size={20} />
                    {!collapsed && <span>Settings</span>}
                </NavLink>
            </div>
        </aside>
    )
}
