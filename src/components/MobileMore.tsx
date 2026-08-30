import { IconSettings } from '@tabler/icons-react'
import { NavLink } from 'react-router-dom'
import { nav } from '../domain/data'
import type { Page } from '../domain/types'

const paths: Partial<Record<Page, string>> = {
    Goals: '/goals',
    Library: '/library',
    Settings: '/settings',
}

export function MobileMore({ page, close }: { page: Page; close: () => void }) {
    const goals = nav.find(({ label }) => label === 'Goals')!
    const library = nav.find(({ label }) => label === 'Library')!
    const links = [goals, library, { label: 'Settings' as const, icon: IconSettings }]

    return (
        <div className="mobile-more-backdrop" onClick={close}>
            <section
                className="mobile-more"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-more-title"
                onClick={event => event.stopPropagation()}
            >
                <div className="mobile-more-heading">
                    <div>
                        <h2 id="mobile-more-title">More</h2>
                        <p>Goals, library, and settings.</p>
                    </div>
                    <button type="button" onClick={close} aria-label="Close more pages">
                        Close
                    </button>
                </div>
                <nav className="mobile-more-links" aria-label="More pages">
                    {links.map(({ label, icon: Icon }) => (
                        <NavLink
                            key={label}
                            to={paths[label] ?? '/today'}
                            onClick={close}
                            aria-current={page === label ? 'page' : undefined}
                        >
                            <Icon size={22} />
                            <span>{label}</span>
                        </NavLink>
                    ))}
                </nav>
            </section>
        </div>
    )
}
