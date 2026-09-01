import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { listGoals, type GoalRecord } from '../lib/goalApi'
import { getPreferences, type Preferences } from '../lib/preferencesApi'
import { serverQueryKeys } from '../lib/serverQueries'

type ServerData = {
    preferences: Preferences | null
    goals: GoalRecord[]
    loading: boolean
    unavailable: boolean
}

const ServerDataContext = createContext<ServerData | null>(null)

function QueriedServerDataProvider({ children }: { children: ReactNode }) {
    const preferencesQuery = useQuery({
        queryKey: serverQueryKeys.preferences,
        queryFn: ({ signal }) => getPreferences(signal),
    })
    const goalsQuery = useQuery({
        queryKey: serverQueryKeys.goals,
        queryFn: ({ signal }) => listGoals(signal),
    })
    const preferences = preferencesQuery.data ?? null
    const goals = goalsQuery.data ?? []
    const loading = preferencesQuery.isPending || goalsQuery.isPending
    const unavailable = preferencesQuery.isError || goalsQuery.isError
    const value = useMemo(
        () => ({ preferences, goals, loading, unavailable }),
        [goals, loading, preferences, unavailable],
    )
    return <ServerDataContext.Provider value={value}>{children}</ServerDataContext.Provider>
}

export function ServerDataProvider({
    children,
    initialData,
}: {
    children: ReactNode
    initialData?: { preferences: Preferences; goals?: GoalRecord[] }
}) {
    if (initialData)
        return (
            <ServerDataContext.Provider
                value={{
                    preferences: initialData.preferences,
                    goals: initialData.goals ?? [],
                    loading: false,
                    unavailable: false,
                }}
            >
                {children}
            </ServerDataContext.Provider>
        )
    return <QueriedServerDataProvider>{children}</QueriedServerDataProvider>
}

export function useServerData() {
    const value = useContext(ServerDataContext)
    if (!value) throw new Error('useServerData must be used inside ServerDataProvider')
    return value
}
