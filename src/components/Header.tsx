import { Text } from '@mantine/core'
import type { Page } from '../domain/types'

export function Header({ page }: { page: Page }) {
    return (
        <header className="topbar">
            <div>
                <Text className="mobile-brand">
                    track <strong>it</strong>
                </Text>
                <Text className="page-context" aria-label="Current section">
                    TrackIt <span aria-hidden="true">/</span> {page}
                </Text>
            </div>
        </header>
    )
}
