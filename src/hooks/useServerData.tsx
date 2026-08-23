import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { listGoals, type GoalRecord } from '../lib/goalApi'
import { getPreferences, type Preferences } from '../lib/preferencesApi'

type ServerData = {
    preferences: Preferences | null
    goals: GoalRecord[]
    loading: boolean
    unavailable: boolean
}

const ServerDataContext = createContext<ServerData | null>(null)
let preferencesRequest: Promise<Preferences> | null = null
let goalsRequest: Promise<GoalRecord[]> | null = null

const loadPreferences = () =>
    (preferencesRequest ??= getPreferences().finally(() => {
        preferencesRequest = null
    }))
const loadGoals = () =>
    (goalsRequest ??= listGoals().finally(() => {
        goalsRequest = null
    }))

export function ServerDataProvider({
    children,
    initialData,
}: {
    children: ReactNode
    initialData?: { preferences: Preferences; goals?: GoalRecord[] }
}) {
    const [preferences, setPreferences] = useState<Preferences | null>(
        initialData?.preferences ?? null,
    )
    const [goals, setGoals] = useState<GoalRecord[]>(initialData?.goals ?? [])
    const [loading, setLoading] = useState(!initialData)
    const [unavailable, setUnavailable] = useState(false)

    useEffect(() => {
        if (initialData) return
        let active = true
        const refreshPreferences = () =>
            void loadPreferences()
                .then(value => {
                    if (!active) return
                    setPreferences(value)
                    setUnavailable(false)
                })
                .catch(() => {
                    if (active) setUnavailable(true)
                })
        const refreshGoals = () =>
            void loadGoals()
                .then(value => {
                    if (!active) return
                    setGoals(value)
                    setUnavailable(false)
                })
                .catch(() => {
                    if (active) setUnavailable(true)
                })
        const savedPreferences = (event: Event) => {
            if (active) setPreferences((event as CustomEvent<Preferences>).detail)
        }
        const savedGoal = (event: Event) => {
            if (!active) return
            const goal = (event as CustomEvent<GoalRecord>).detail
            setGoals(current => [goal, ...current.filter(item => item.id !== goal.id)])
        }
        void Promise.all([loadPreferences(), loadGoals()])
            .then(([savedPreferences, savedGoals]) => {
                if (!active) return
                setPreferences(savedPreferences)
                setGoals(savedGoals)
                setUnavailable(false)
            })
            .catch(() => active && setUnavailable(true))
            .finally(() => active && setLoading(false))
        window.addEventListener('trackit:preferences-changed', refreshPreferences)
        window.addEventListener('trackit:preferences-saved', savedPreferences)
        window.addEventListener('trackit:goals-changed', refreshGoals)
        window.addEventListener('trackit:goal-saved', savedGoal)
        return () => {
            active = false
            window.removeEventListener('trackit:preferences-changed', refreshPreferences)
            window.removeEventListener('trackit:preferences-saved', savedPreferences)
            window.removeEventListener('trackit:goals-changed', refreshGoals)
            window.removeEventListener('trackit:goal-saved', savedGoal)
        }
    }, [initialData])

    const value = useMemo(
        () => ({ preferences, goals, loading, unavailable }),
        [goals, loading, preferences, unavailable],
    )
    return <ServerDataContext.Provider value={value}>{children}</ServerDataContext.Provider>
}

// The provider and its companion hook intentionally share this small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useServerData() {
    const value = useContext(ServerDataContext)
    if (!value) throw new Error('useServerData must be used inside ServerDataProvider')
    return value
}
