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
import type { JournalEvent, Page } from './domain/types'
import { useJournal } from './hooks/useJournal'
import { useLogger } from './logging/LoggingContext'

const Today = lazy(() => import('./pages/Today').then(module => ({ default: module.Today })))
const Journal = lazy(() => import('./pages/Journal').then(module => ({ default: module.Journal })))
const Nutrition = lazy(() =>
    import('./pages/Nutrition').then(module => ({ default: module.Nutrition })),
)
const Trends = lazy(() => import('./pages/Trends').then(module => ({ default: module.Trends })))
const Metrics = lazy(() => import('./pages/Metrics').then(module => ({ default: module.Metrics })))
const Goals = lazy(() => import('./pages/Goals').then(module => ({ default: module.Goals })))
const Connections = lazy(() =>
    import('./pages/Connections').then(module => ({ default: module.Connections })),
)
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
const ReminderPrompt = lazy(() =>
    import('./components/ReminderPrompt').then(module => ({ default: module.ReminderPrompt })),
)

const pagePaths: Record<Page, string> = {
    Today: '/today',
    Nutrition: '/nutrition',
    Journal: '/journal',
    Goals: '/goals',
    Trends: '/trends',
    Metrics: '/metrics',
    Connections: '/connections',
    Settings: '/settings',
}

const pathPages = Object.fromEntries(
    Object.entries(pagePaths).map(([page, path]) => [path, page]),
) as Record<string, Page>

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
    const page = location.pathname.startsWith('/settings')
        ? 'Settings'
        : location.pathname.startsWith('/connections')
          ? 'Connections'
          : (pathPages[location.pathname] ?? 'Today')
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
    const { events, add, remove, update, syncFailure, retry, hasOlder, loadingOlder, loadOlder } =
        useJournal(journalQuery)
    const [lastAdded, setLastAdded] = useState<JournalEvent | null>(null)
    const mainRef = useRef<HTMLElement>(null)
    const previousPath = useRef(location.pathname)

    useEffect(() => {
        if (previousPath.current !== location.pathname) mainRef.current?.focus()
        previousPath.current = location.pathname
    }, [location.pathname])

    const openPage = (nextPage: Page) => navigate(pagePaths[nextPage])
    const duplicate = (event: JournalEvent) => {
        const copy = {
            ...event,
            id: crypto.randomUUID(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            source: 'You',
            version: undefined,
        }
        add(copy, true)
        setLastAdded(copy)
    }
    const addQuick = (event: JournalEvent, allowDuplicate = false) => {
        if (!add(event, allowDuplicate)) return false
        setLastAdded(event)
        return true
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
                    {syncFailure && (
                        <Box px="xl" pt="md">
                            <SyncStatus message={syncFailure} retry={retry} />
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
                                        duplicate={duplicate}
                                        update={update}
                                        hasOlder={hasOlder}
                                        loadingOlder={loadingOlder}
                                        loadOlder={loadOlder}
                                    />
                                }
                            />
                            <Route
                                path="/nutrition"
                                element={
                                    <Nutrition
                                        selectedDate={selectedDay}
                                        onSelectedDateChange={setSelectedDay}
                                    />
                                }
                            />
                            <Route path="/goals" element={<Goals />} />
                            <Route path="/trends" element={<Trends />} />
                            <Route path="/metrics" element={<Metrics />} />
                            <Route path="/connections" element={<Connections />} />
                            <Route path="/connections/devices" element={<DeviceManagement />} />
                            <Route path="/connections/devices/new" element={<DeviceNew />} />
                            <Route path="/connections/mcp" element={<McpAccess />} />
                            <Route path="/connections/mcp/new" element={<McpNew />} />
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
                    .filter(({ label }) => ['Today', 'Journal'].includes(label))
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
                {nav
                    .filter(({ label }) => label === 'Trends')
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
                    className={
                        ['Nutrition', 'Goals', 'Metrics', 'Connections', 'Settings'].includes(page)
                            ? 'active'
                            : ''
                    }
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
                <ReminderPrompt open={openLogger} />
            </Suspense>
            {moreOpen && (
                <Suspense fallback={null}>
                    <MobileMore page={page} close={() => setMoreOpen(false)} />
                </Suspense>
            )}
            <LoggerHost
                add={addQuick}
                selectedDate={['Today', 'Journal', 'Nutrition'].includes(page) ? selectedDay : null}
            />
            {!['Goals', 'Metrics', 'Connections'].includes(page) && <GlobalLogFab />}
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
