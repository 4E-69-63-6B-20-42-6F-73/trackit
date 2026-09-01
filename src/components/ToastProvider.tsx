import { Notification, Portal } from '@mantine/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ToastContext, type ToastContextValue, type ToastTone } from './toastContext'

type ToastState = {
    message: string
    tone: ToastTone
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<ToastState | null>(null)
    const timeoutRef = useRef<number | null>(null)

    const dismiss = useCallback(() => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
        setToast(null)
    }, [])

    const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        setToast({ message, tone })
        timeoutRef.current = window.setTimeout(() => {
            timeoutRef.current = null
            setToast(null)
        }, 3200)
    }, [])

    useEffect(
        () => () => {
            if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        },
        [],
    )

    const value = useMemo<ToastContextValue>(
        () => ({
            showToast,
            success: message => showToast(message, 'success'),
            error: message => showToast(message, 'error'),
            info: message => showToast(message, 'info'),
        }),
        [showToast],
    )

    return (
        <ToastContext.Provider value={value}>
            {children}
            {toast && (
                <Portal>
                    <div
                        aria-live="polite"
                        style={{
                            position: 'fixed',
                            right: 'var(--mantine-spacing-md)',
                            bottom: 'var(--mantine-spacing-md)',
                            zIndex: 10000,
                            width: 'min(360px, calc(100vw - 2 * var(--mantine-spacing-md)))',
                        }}
                    >
                        <Notification
                            color={
                                toast.tone === 'error'
                                    ? 'red'
                                    : toast.tone === 'info'
                                      ? 'blue'
                                      : 'teal'
                            }
                            title={toast.tone === 'error' ? 'Something went wrong' : undefined}
                            withCloseButton
                            onClose={dismiss}
                        >
                            {toast.message}
                        </Notification>
                    </div>
                </Portal>
            )}
        </ToastContext.Provider>
    )
}
