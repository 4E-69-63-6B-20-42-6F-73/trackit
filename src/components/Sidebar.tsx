import { ActionIcon, Text } from '@mantine/core'
import { IconActivity, IconLayoutSidebarLeftCollapse, IconSettings } from '@tabler/icons-react'
import { NavLink } from 'react-router-dom'
import { nav } from '../domain/data'
import type { Page } from '../domain/types'

export function Sidebar({
    page,
    collapsed,
    toggle,
}: {
    page: Page
    collapsed: boolean
    toggle: () => void
}) {
    const groups = [
        {
            label: 'Daily',
            items: nav.filter(item => ['Today', 'Journal', 'Goals'].includes(item.label)),
        },
        {
            label: 'Explore',
            items: nav.filter(item => ['Nutrition', 'Trends'].includes(item.label)),
        },
        { label: 'Data', items: nav.filter(item => item.label === 'Connections') },
    ]

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
            <nav>
                {groups.map(group => (
                    <div className="nav-group" key={group.label}>
                        {!collapsed && <Text className="nav-group-label">{group.label}</Text>}
                        {group.items.map(({ label, icon: Icon }) => (
                            <NavLink
                                aria-label={label}
                                aria-current={page === label ? 'page' : undefined}
                                className={`nav-item ${page === label ? 'active' : ''}`}
                                key={label}
                                to={`/${label.toLowerCase()}`}
                            >
                                <Icon size={20} stroke={1.7} />
                                {!collapsed && <span>{label}</span>}
                            </NavLink>
                        ))}
                    </div>
                ))}
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
