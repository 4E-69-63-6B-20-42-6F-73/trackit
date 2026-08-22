import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Box, Button, Center, Loader, Notification } from '@mantine/core'
import { IconCircleCheck, IconSettings } from '@tabler/icons-react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Header } from './components/Header'
import { MigrationPrompt } from './components/MigrationPrompt'
import { QuickAdd, type QuickAddKind } from './components/QuickAdd'
import { Sidebar } from './components/Sidebar'
import { SyncStatus } from './components/SyncStatus'
import { nav } from './domain/data'
import type { JournalEvent, Page } from './domain/types'
import { useJournal } from './hooks/useJournal'
import { createObservation } from './lib/observationApi'

const Today = lazy(() => import('./pages/Today').then(module => ({ default: module.Today })))
const Journal = lazy(() => import('./pages/Journal').then(module => ({ default: module.Journal })))
const Nutrition = lazy(() =>
    import('./pages/Nutrition').then(module => ({ default: module.Nutrition })),
)
const Trends = lazy(() => import('./pages/Trends').then(module => ({ default: module.Trends })))
const Goals = lazy(() => import('./pages/Goals').then(module => ({ default: module.Goals })))
const Connections = lazy(() =>
    import('./pages/Connections').then(module => ({ default: module.Connections })),
)
const DeviceManagement = lazy(() =>
    import('./pages/DeviceManagement').then(module => ({ default: module.DeviceManagement })),
)
const Settings = lazy(() =>
    import('./pages/Settings').then(module => ({ default: module.Settings })),
)

const pagePaths: Record<Page, string> = {
    Today: '/today',
    Nutrition: '/nutrition',
    Journal: '/journal',
    Goals: '/goals',
    Trends: '/trends',
    Connections: '/connections',
    Settings: '/settings',
}

const pathPages = Object.fromEntries(
    Object.entries(pagePaths).map(([page, path]) => [path, page]),
) as Record<string, Page>

export default function App() {
    const navigate = useNavigate()
    const location = useLocation()
    const page = location.pathname.startsWith('/settings')
        ? 'Settings'
        : location.pathname.startsWith('/connections')
          ? 'Connections'
          : (pathPages[location.pathname] ?? 'Today')
    const [quick, setQuick] = useState<QuickAddKind | null>(null)
    const [collapsed, setCollapsed] = useState(false)
    const [insight, setInsight] = useState(true)
    const [observationRetry, setObservationRetry] = useState<JournalEvent | null>(null)
    const {
        events,
        migrationPending,
        dismissMigration,
        migrate,
        add,
        remove,
        update,
        syncFailure,
        retry,
    } = useJournal()
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
    const persistObservation = async (event: JournalEvent) => {
        if (!event.observation) return
        try {
            await createObservation(event.id, event.observation)
            window.dispatchEvent(new Event('trackit:observations-changed'))
            setObservationRetry(null)
        } catch {
            setObservationRetry(event)
        }
    }
    const addQuick = (event: JournalEvent, allowDuplicate = false) => {
        if (!add(event, allowDuplicate)) return false
        void persistObservation(event)
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
                    <Header page={page} add={() => setQuick('Meal')} />
                    {syncFailure && (
                        <Box px="xl" pt="md">
                            <SyncStatus message={syncFailure} retry={retry} />
                        </Box>
                    )}
                    {observationRetry && (
                        <Box px="xl" pt="md">
                            <SyncStatus
                                message="The journal entry is safe, but its dashboard measurement is not saved yet."
                                retry={() => void persistObservation(observationRetry)}
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
                                        quickAdd={setQuick}
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
                                    />
                                }
                            />
                            <Route path="/nutrition" element={<Nutrition />} />
                            <Route path="/goals" element={<Goals />} />
                            <Route path="/trends" element={<Trends />} />
                            <Route path="/connections" element={<Connections />} />
                            <Route path="/connections/devices" element={<DeviceManagement />} />
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
                {[...nav, { label: 'Settings' as const, icon: IconSettings }].map(
                    ({ label, icon: Icon }) => (
                        <NavLink
                            className={page === label ? 'active' : ''}
                            aria-current={page === label ? 'page' : undefined}
                            to={pagePaths[label]}
                            key={label}
                        >
                            <Icon size={21} />
                            <span>{label}</span>
                        </NavLink>
                    ),
                )}
            </nav>
            <QuickAdd
                key={quick ?? 'closed'}
                opened={quick !== null}
                close={() => setQuick(null)}
                add={addQuick}
                initialKind={quick ?? undefined}
            />
            <MigrationPrompt
                opened={migrationPending}
                count={events.length}
                migrate={migrate}
                close={dismissMigration}
            />
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
