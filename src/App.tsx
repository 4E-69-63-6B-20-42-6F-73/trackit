import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, Button, Center, Loader, Notification } from '@mantine/core'
import { IconCircleCheck } from '@tabler/icons-react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Header } from './components/Header'
import { GlobalLogFab } from './components/logging/GlobalLogFab'
import { LoggerHost } from './components/logging/LoggerHost'
import { Sidebar } from './components/Sidebar'
import { SyncStatus } from './components/SyncStatus'
import { nav } from './domain/data'
import type { Page } from './domain/types'
import { useJournal } from './hooks/useJournal'
import { useObservationCommands } from './hooks/useObservationCommands'
import type { CreateObservationInput } from './lib/observationApi'
import { useLogger } from './logging/LoggingContext'

const Today = lazy(() => import('./pages/Today').then(module => ({ default: module.Today })))
const Journal = lazy(() => import('./pages/Journal').then(module => ({ default: module.Journal })))
const Trends = lazy(() => import('./pages/Trends').then(module => ({ default: module.Trends })))
const Metrics = lazy(() => import('./pages/Metrics').then(module => ({ default: module.Metrics })))
const Goals = lazy(() => import('./pages/Goals').then(module => ({ default: module.Goals })))
const Library = lazy(() => import('./pages/Library').then(module => ({ default: module.Library })))
const DeviceManagement = lazy(() =>
    import('./pages/connections/devices/index').then(module => ({ default: module.Devices })),
)
const DeviceNew = lazy(() =>
    import('./pages/connections/devices/new').then(module => ({ default: module.DeviceNew })),
)
const McpAccess = lazy(() =>
    import('./pages/connections/mcp/index').then(module => ({ default: module.McpAccess })),
)
const McpNew = lazy(() =>
    import('./pages/connections/mcp/new').then(module => ({ default: module.McpNew })),
)
const Settings = lazy(() =>
    import('./pages/Settings').then(module => ({ default: module.Settings })),
)
const MobileMore = lazy(() =>
    import('./components/MobileMore').then(module => ({ default: module.MobileMore })),
)
const Onboarding = lazy(() =>
    import('./components/Onboarding').then(module => ({ default: module.Onboarding })),
)

const pagePaths: Record<Page, string> = {
    Today: '/today',
    Journal: '/journal',
    Trends: '/trends',
    Goals: '/goals',
    Library: '/library',
    Connections: '/settings/connections',
    Settings: '/settings',
}

const localDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const dayRange = (value: string) => {
    const from = new Date(`${value}T00:00:00`)
    const to = new Date(from)
    to.setDate(to.getDate() + 1)
    return { from: from.toISOString(), to: to.toISOString() }
}

const currentWeekRange = () => {
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
    const to = new Date()
    to.setDate(to.getDate() + 1)
    to.setHours(0, 0, 0, 0)
    return { from: from.toISOString(), to: to.toISOString() }
}

export default function App() {
    const navigate = useNavigate()
    const { openLogger } = useLogger()
    const location = useLocation()
    const page: Page = location.pathname.startsWith('/settings')
        ? 'Settings'
        : location.pathname.startsWith('/connections')
          ? 'Connections'
          : location.pathname.startsWith('/library')
            ? 'Library'
            : location.pathname.startsWith('/journal')
              ? 'Journal'
              : location.pathname.startsWith('/trends')
                ? 'Trends'
                : location.pathname.startsWith('/goals')
                  ? 'Goals'
                  : 'Today'
    const [selectedDay, setSelectedDay] = useState<string | null>(() => localDateKey(new Date()))
    const [collapsed, setCollapsed] = useState(false)
    const [moreOpen, setMoreOpen] = useState(false)
    const [insight, setInsight] = useState(true)
    const journalQuery =
        page === 'Today' && selectedDay
            ? {
                  ...(selectedDay === localDateKey(new Date())
                      ? currentWeekRange()
                      : dayRange(selectedDay)),
                  limit: 100,
              }
            : page === 'Journal' && selectedDay
              ? { ...dayRange(selectedDay), limit: 100 }
              : { limit: page === 'Journal' ? 100 : 10 }
    const { events, refresh, syncFailure, retry, hasOlder, loadingOlder, loadOlder } =
        useJournal(journalQuery)
    const { add, remove, update, commandFailure, retryCommand } = useObservationCommands(refresh)
    const [lastAdded, setLastAdded] = useState<{ id: string; title: string } | null>(null)
    const mainRef = useRef<HTMLElement>(null)
    const previousPath = useRef(location.pathname)

    useEffect(() => {
        if (previousPath.current !== location.pathname) mainRef.current?.focus()
        previousPath.current = location.pathname
    }, [location.pathname])

    const openPage = (nextPage: Page) => navigate(pagePaths[nextPage])
    const addQuick = (input: CreateObservationInput) => {
        add(input)
        setLastAdded({ id: input.id!, title: input.title ?? input.definitionId })
    }

    const loading = (
        <Center mih={320}>
            <Loader role="status" color="teal" aria-label="Loading page" />
        </Center>
    )

    return (
        <>
            <a className="skip-link" href="#main-content">
                Skip to main content
            </a>
            <Box className="app-shell">
                <Sidebar
                    page={page}
                    collapsed={collapsed}
                    toggle={() => setCollapsed(!collapsed)}
                />
                <main ref={mainRef} className="main" id="main-content" tabIndex={-1}>
                    <Header page={page} />
                    {(commandFailure || syncFailure) && (
                        <Box px="xl" pt="md">
                            <SyncStatus
                                message={commandFailure || syncFailure}
                                retry={commandFailure ? retryCommand : retry}
                            />
                        </Box>
                    )}
                    <Suspense fallback={loading}>
                        <Routes>
                            <Route
                                path="/today"
                                element={
                                    <Today
                                        events={events}
                                        insight={insight}
                                        dismissInsight={() => setInsight(false)}
                                        openJournal={() => openPage('Journal')}
                                        openTrends={() => openPage('Trends')}
                                        openConnections={() => openPage('Connections')}
                                        openGoals={() => openPage('Goals')}
                                        openLogger={openLogger}
                                        onSelectedDateChange={setSelectedDay}
                                        initialSelectedDate={selectedDay}
                                    />
                                }
                            />
                            <Route
                                path="/journal"
                                element={
                                    <Journal
                                        events={events}
                                        remove={remove}
                                        update={(event, changes) =>
                                            update(event.id, {
                                                ...changes,
                                                version: event.version ?? 1,
                                            })
                                        }
                                        hasOlder={hasOlder}
                                        loadingOlder={loadingOlder}
                                        loadOlder={loadOlder}
                                    />
                                }
                            />
                            <Route path="/goals" element={<Goals />} />
                            <Route path="/trends" element={<Trends />} />
                            <Route path="/library" element={<Library />} />
                            <Route path="/library/metrics" element={<Metrics />} />
                            <Route path="/nutrition" element={<Navigate to="/library" replace />} />
                            <Route path="/metrics" element={<Navigate to="/library/metrics" replace />} />
                            <Route
                                path="/settings/connections/devices"
                                element={<DeviceManagement />}
                            />
                            <Route
                                path="/settings/connections/devices/new"
                                element={<DeviceNew />}
                            />
                            <Route path="/settings/connections/mcp" element={<McpAccess />} />
                            <Route path="/settings/connections/mcp/new" element={<McpNew />} />
                            <Route
                                path="/connections"
                                element={<Navigate to="/settings/connections" replace />}
                            />
                            <Route
                                path="/connections/devices"
                                element={<Navigate to="/settings/connections/devices" replace />}
                            />
                            <Route
                                path="/connections/devices/new"
                                element={<Navigate to="/settings/connections/devices/new" replace />}
                            />
                            <Route
                                path="/connections/mcp"
                                element={<Navigate to="/settings/connections/mcp" replace />}
                            />
                            <Route
                                path="/connections/mcp/new"
                                element={<Navigate to="/settings/connections/mcp/new" replace />}
                            />
                            <Route
                                path="/settings/goals"
                                element={<Navigate to="/goals" replace />}
                            />
                            <Route path="/settings/*" element={<Settings />} />
                            <Route path="*" element={<Navigate to="/today" replace />} />
                        </Routes>
                    </Suspense>
                </main>
            </Box>
            <nav className="mobile-nav" aria-label="Primary navigation">
                {nav
                    .filter(({ label }) => ['Today', 'Journal', 'Trends', 'Goals'].includes(label))
                    .map(({ label, icon: Icon }) => (
                        <NavLink
                            className={page === label ? 'active' : ''}
                            aria-current={page === label ? 'page' : undefined}
                            to={pagePaths[label]}
                            key={label}
                        >
                            <Icon size={21} />
                            <span>{label}</span>
                        </NavLink>
                    ))}
                <button
                    className={['Library', 'Connections', 'Settings'].includes(page) ? 'active' : ''}
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-label="Open more pages"
                >
                    <span className="more-symbol" aria-hidden="true">
                        •••
                    </span>
                    <span>More</span>
                </button>
            </nav>
            <Suspense fallback={null}>
                <Onboarding />
            </Suspense>
            {moreOpen && (
                <Suspense fallback={null}>
                    <MobileMore page={page} close={() => setMoreOpen(false)} />
                </Suspense>
            )}
            <LoggerHost
                add={addQuick}
                selectedDate={['Today', 'Journal'].includes(page) ? selectedDay : null}
            />
            {!['Connections'].includes(page) && <GlobalLogFab />}
            {lastAdded && (
                <Notification
                    className="record-feedback"
                    role="status"
                    icon={<IconCircleCheck size={18} />}
                    color="trackit"
                    title="Entry added"
                    onClose={() => setLastAdded(null)}
                >
                    {lastAdded.title} was added.
                    <Button
                        ml="xs"
                        size="compact-xs"
                        variant="subtle"
                        color="trackit"
                        onClick={() => {
                            remove(lastAdded.id)
                            setLastAdded(null)
                        }}
                    >
                        Undo
                    </Button>
                </Notification>
            )}
        </>
    )
}
