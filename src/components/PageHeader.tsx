import { isValidElement, type ReactNode } from 'react'
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
    const libraryBackAction =
        isValidElement<{ to?: string }>(actions) && actions.props.to === '/library' ? actions : null

    return (
        <header className="page-header">
            <div className="page-header-copy">
                {libraryBackAction && <div style={{ marginBottom: 8 }}>{libraryBackAction}</div>}
                {eyebrow && <Text className="eyebrow">{eyebrow}</Text>}
                <h1>{title}</h1>
                {description && <Text className="subhead">{description}</Text>}
            </div>
            {actions && !libraryBackAction && <div className="page-header-actions">{actions}</div>}
        </header>
    )
}
