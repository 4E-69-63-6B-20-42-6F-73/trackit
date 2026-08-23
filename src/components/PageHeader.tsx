import type { ReactNode } from 'react'
import { Text } from '@mantine/core'

export function PageHeader({
    title,
    description,
    eyebrow,
    actions,
}: {
    title: ReactNode
    description?: ReactNode
    eyebrow?: ReactNode
    actions?: ReactNode
}) {
    return (
        <header className="page-header">
            <div className="page-header-copy">
                {eyebrow && <Text className="eyebrow">{eyebrow}</Text>}
                <h1>{title}</h1>
                {description && <Text className="subhead">{description}</Text>}
            </div>
            {actions && <div className="page-header-actions">{actions}</div>}
        </header>
    )
}
