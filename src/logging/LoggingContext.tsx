import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { LogActionId } from './logActions'

type LoggingContextValue = {
    activeLogger: LogActionId | null
    openLogger: (id: LogActionId, invoker?: HTMLElement | null) => void
    closeLogger: () => void
}

const LoggingContext = createContext<LoggingContextValue | null>(null)

export function LoggingProvider({ children }: { children: ReactNode }) {
    const [activeLogger, setActiveLogger] = useState<LogActionId | null>(null)
    const invoker = useRef<HTMLElement | null>(null)
    const openLogger = useCallback((id: LogActionId, source?: HTMLElement | null) => {
        invoker.current = source ?? (document.activeElement as HTMLElement | null)
        setActiveLogger(id)
    }, [])
    const closeLogger = useCallback(() => {
        setActiveLogger(null)
        window.setTimeout(() => invoker.current?.focus(), 0)
    }, [])
    const value = useMemo(
        () => ({ activeLogger, openLogger, closeLogger }),
        [activeLogger, closeLogger, openLogger],
    )
    return <LoggingContext.Provider value={value}>{children}</LoggingContext.Provider>
}

// Provider and hook intentionally share this small state module.
// eslint-disable-next-line react-refresh/only-export-components
export function useLogger() {
    const value = useContext(LoggingContext)
    if (!value) throw new Error('useLogger must be used inside LoggingProvider')
    return value
}
