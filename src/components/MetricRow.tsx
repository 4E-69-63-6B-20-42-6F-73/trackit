import { IconChevronRight } from '@tabler/icons-react'
import type { MetricDefinition } from '@trackit/domain/metricCatalog'
import { unitPresentation } from '@trackit/domain/metrics'

export function MetricRow({
    metric,
    displayUnit,
    clickable,
    onClick,
}: {
    metric: MetricDefinition
    displayUnit: string
    clickable: boolean
    onClick?: () => void
}) {
    const content = (
        <>
            <span className="metric-row-name">{metric.name}</span>
            <span className="metric-row-value">
                <span className="metric-row-unit">{unitPresentation(displayUnit).label}</span>
                {clickable && <IconChevronRight aria-hidden="true" size={17} />}
            </span>
        </>
    )

    return clickable ? (
        <button
            className="metric-row metric-row-clickable"
            type="button"
            onClick={onClick}
            aria-label={`Configure ${metric.name}, current unit ${unitPresentation(displayUnit).name}`}
        >
            {content}
        </button>
    ) : (
        <div className="metric-row">{content}</div>
    )
}
