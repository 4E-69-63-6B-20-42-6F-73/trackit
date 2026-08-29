import { useEffect, useMemo, useRef, useState } from 'react'
import { IconPlus, IconSearch, IconX } from '@tabler/icons-react'
import { logActions } from '../../logging/logActions'
import { useLogger } from '../../logging/LoggingContext'

export function GlobalLogFab() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const root = useRef<HTMLDivElement>(null)
    const button = useRef<HTMLButtonElement>(null)
    const search = useRef<HTMLInputElement>(null)
    const { openLogger } = useLogger()
    const filteredActions = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (!needle) return logActions
        return logActions.filter(action =>
            [action.label, action.description, ...action.keywords]
                .join(' ')
                .toLowerCase()
                .includes(needle),
        )
    }, [query])

    useEffect(() => {
        const openMenu = () => {
            setQuery('')
            setOpen(true)
        }
        window.addEventListener('trackit:open-log-menu', openMenu)
        return () => window.removeEventListener('trackit:open-log-menu', openMenu)
    }, [])

    useEffect(() => {
        if (!open) return
        requestAnimationFrame(() => search.current?.focus())
        const closeOutside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                setOpen(false)
                setQuery('')
            }
        }
        const closeEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false)
                setQuery('')
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
                    <label className="log-speed-search">
                        <IconSearch size={16} aria-hidden="true" />
                        <input
                            ref={search}
                            type="search"
                            value={query}
                            onChange={event => setQuery(event.currentTarget.value)}
                            placeholder="What do you want to log?"
                            aria-label="Search log options"
                        />
                    </label>
                    {filteredActions.map(({ id, label, description, icon: Icon }) => (
                        <button
                            type="button"
                            role="menuitem"
                            key={id}
                            onClick={() => {
                                setOpen(false)
                                setQuery('')
                                openLogger(id, button.current)
                            }}
                        >
                            <Icon size={19} aria-hidden="true" />
                            <span>
                                <strong>{label}</strong>
                                <small>{description}</small>
                            </span>
                        </button>
                    ))}
                    {filteredActions.length === 0 && (
                        <div className="log-speed-empty">No matching log option yet.</div>
                    )}
                </div>
            )}
            <button
                ref={button}
                type="button"
                className="global-log-fab"
                aria-label={open ? 'Close log menu' : 'Log health information'}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => {
                    setOpen(value => !value)
                    if (open) setQuery('')
                }}
            >
                {open ? <IconX size={22} /> : <IconPlus size={22} />}
                <span>Log</span>
            </button>
        </div>
    )
}
