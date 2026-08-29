import { useEffect, useMemo, useRef, useState } from 'react'
import { IconPlus, IconSearch, IconX } from '@tabler/icons-react'
import { logActions } from '../../logging/logActions'
import { useLogger } from '../../logging/LoggingContext'

export function GlobalLogFab() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const [reduceMotion, setReduceMotion] = useState(false)
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
        if (typeof window.matchMedia !== 'function') return
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
        const updatePreference = () => setReduceMotion(preference.matches)
        updatePreference()
        preference.addEventListener?.('change', updatePreference)
        return () => preference.removeEventListener?.('change', updatePreference)
    }, [])

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

    const transition = reduceMotion
        ? 'none'
        : open
          ? 'opacity 160ms ease, transform 160ms ease, visibility 0s'
          : 'opacity 140ms ease, transform 140ms ease, visibility 0s linear 140ms'

    return (
        <div className="global-log" ref={root}>
            <div
                className="log-speed-dial"
                role="dialog"
                aria-label="Choose what to log"
                aria-hidden={!open}
                style={{
                    position: 'absolute',
                    right: 0,
                    bottom: 'calc(100% + 10px)',
                    width: 'min(256px, calc(100vw - 32px))',
                    opacity: open ? 1 : 0,
                    transform: open ? 'translateY(0)' : 'translateY(8px)',
                    pointerEvents: open ? 'auto' : 'none',
                    visibility: open ? 'visible' : 'hidden',
                    transition,
                }}
            >
                <label className="log-speed-search" style={{ display: 'flex', width: '100%' }}>
                    <IconSearch size={16} aria-hidden="true" />
                    <input
                        ref={search}
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.currentTarget.value)}
                        placeholder="What do you want to log?"
                        aria-label="Search log options"
                        tabIndex={open ? 0 : -1}
                        style={{ width: '100%' }}
                    />
                </label>
                {filteredActions.map(({ id, label, description, icon: Icon }) => (
                    <button
                        type="button"
                        key={id}
                        tabIndex={open ? 0 : -1}
                        style={{ width: '100%' }}
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
                    <div className="log-speed-empty" style={{ width: '100%' }}>
                        No matching log option yet.
                    </div>
                )}
            </div>
            <button
                ref={button}
                type="button"
                className="global-log-fab"
                aria-label={open ? 'Close log menu' : 'Log health information'}
                aria-expanded={open}
                aria-haspopup="dialog"
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
