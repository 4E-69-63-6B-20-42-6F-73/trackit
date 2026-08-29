import { useEffect, useRef, useState } from 'react'
import { IconPlus, IconX } from '@tabler/icons-react'
import { logActions } from '../../logging/logActions'
import { useLogger } from '../../logging/LoggingContext'

export function GlobalLogFab() {
    const [open, setOpen] = useState(false)
    const root = useRef<HTMLDivElement>(null)
    const button = useRef<HTMLButtonElement>(null)
    const { openLogger } = useLogger()

    useEffect(() => {
        const openMenu = () => {
            setOpen(true)
            requestAnimationFrame(() => button.current?.focus())
        }
        window.addEventListener('trackit:open-log-menu', openMenu)
        return () => window.removeEventListener('trackit:open-log-menu', openMenu)
    }, [])

    useEffect(() => {
        if (!open) return
        const closeOutside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false)
        }
        const closeEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false)
                button.current?.focus()
            }
        }
        document.addEventListener('pointerdown', closeOutside)
        document.addEventListener('keydown', closeEscape)
        return () => {
            document.removeEventListener('pointerdown', closeOutside)
            document.removeEventListener('keydown', closeEscape)
        }
    }, [open])

    return (
        <div className="global-log" ref={root}>
            {open && (
                <div className="log-speed-dial" role="menu" aria-label="Choose what to log">
                    {logActions.map(({ id, label, icon: Icon }) => (
                        <button
                            type="button"
                            role="menuitem"
                            key={id}
                            onClick={() => {
                                setOpen(false)
                                openLogger(id, button.current)
                            }}
                        >
                            <Icon size={19} aria-hidden="true" />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            )}
            <button
                ref={button}
                type="button"
                className="global-log-fab"
                aria-label={open ? 'Close log menu' : 'Log health information'}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen(value => !value)}
            >
                {open ? <IconX size={22} /> : <IconPlus size={22} />}
                <span>Log</span>
            </button>
        </div>
    )
}
