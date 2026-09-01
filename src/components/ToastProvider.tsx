import { Notification, Portal } from '@mantine/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { subscribeToToasts, type ToastEvent } from './toast'

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toast, setToast] = useState<ToastEvent | null>(null)
    const timeoutRef = useRef<number | null>(null)

    const dismiss = useCallback(() => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
        setToast(null)
    }, [])

    const showToast = useCallback((nextToast: ToastEvent) => {
        if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        setToast(nextToast)
        timeoutRef.current = window.setTimeout(() => {
            timeoutRef.current = null
            setToast(null)
        }, 3200)
    }, [])

    useEffect(() => {
        const unsubscribe = subscribeToToasts(showToast)
        return () => {
            unsubscribe()
            if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
        }
    }, [showToast])

    return (
        <>
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
        </>
    )
}
