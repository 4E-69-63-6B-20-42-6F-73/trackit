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

export function ServerDataProvider({
    children,
    initialData,
}: {
    children: ReactNode
    initialData?: { preferences: Preferences; goals?: GoalRecord[] }
}) {
    const preferencesQuery = useQuery({
        queryKey: serverQueryKeys.preferences,
        queryFn: ({ signal }) => getPreferences(signal),
        initialData: initialData?.preferences,
    })
    const goalsQuery = useQuery({
        queryKey: serverQueryKeys.goals,
        queryFn: ({ signal }) => listGoals(signal),
        initialData: initialData?.goals,
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

export function useServerData() {
    const value = useContext(ServerDataContext)
    if (!value) throw new Error('useServerData must be used inside ServerDataProvider')
    return value
}
