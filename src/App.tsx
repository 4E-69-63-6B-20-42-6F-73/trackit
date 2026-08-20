import { useEffect, useState } from 'react'
import { Box } from '@mantine/core'
import { Header } from './components/Header'
import { QuickAdd } from './components/QuickAdd'
import { Sidebar } from './components/Sidebar'
import { initialEvents, nav } from './domain/data'
import type { JournalEvent, Page } from './domain/types'
import { Connections } from './pages/Connections'
import { Journal } from './pages/Journal'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'
import { Trends } from './pages/Trends'

export default function App() {
    const [page, setPage] = useState<Page>('Today')
    const [quick, setQuick] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [insight, setInsight] = useState(true)
    const [events, setEvents] = useState<JournalEvent[]>(() => {
        try {
            return JSON.parse(localStorage.getItem('trackit-events') || 'null') || initialEvents
        } catch {
            return initialEvents
        }
    })

    useEffect(() => localStorage.setItem('trackit-events', JSON.stringify(events)), [events])

    const add = (event: JournalEvent) => setEvents(current => [event, ...current])
    const remove = (id: string) => setEvents(current => current.filter(event => event.id !== id))
    const duplicate = (event: JournalEvent) =>
        add({
            ...event,
            id: crypto.randomUUID(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            source: 'You',
        })

    const screen =
        page === 'Today' ? (
            <Today
                events={events}
                insight={insight}
                dismissInsight={() => setInsight(false)}
                openJournal={() => setPage('Journal')}
            />
        ) : page === 'Journal' ? (
            <Journal events={events} remove={remove} duplicate={duplicate} />
        ) : page === 'Trends' ? (
            <Trends />
        ) : page === 'Connections' ? (
            <Connections events={events} />
        ) : (
            <Settings />
        )

    return (
        <>
            <Box className="app-shell">
                <Sidebar
                    page={page}
                    setPage={setPage}
                    collapsed={collapsed}
                    toggle={() => setCollapsed(!collapsed)}
                />
                <main className="main">
                    <Header page={page} add={() => setQuick(true)} />
                    {screen}
                </main>
            </Box>
            <nav className="mobile-nav">
                {nav.slice(0, 4).map(({ label, icon: Icon }) => (
                    <button
                        className={page === label ? 'active' : ''}
                        onClick={() => setPage(label)}
                        key={label}
                    >
                        <Icon size={21} />
                        <span>{label}</span>
                    </button>
                ))}
            </nav>
            <QuickAdd opened={quick} close={() => setQuick(false)} add={add} />
        </>
    )
}
