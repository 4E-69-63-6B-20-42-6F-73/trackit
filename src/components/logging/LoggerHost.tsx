import { useEffect, useState } from 'react'
import { IconCircleCheck } from '@tabler/icons-react'
import type { CreateObservationInput } from '../../lib/observationApi'
import { useLogger } from '../../logging/LoggingContext'
import type { LogActionId } from '../../logging/logActions'
import { FoodLogger } from './FoodLogger'
import { ManualEntryLogger, type ManualEntryKind } from './ManualEntryLogger'

const kinds: Record<Exclude<LogActionId, 'food'>, ManualEntryKind> = {
    water: 'Water',
    weight: 'Weight',
    energy: 'Check-in',
    symptom: 'Symptom',
    journal: 'Note',
}

export function LoggerHost({
    add,
    pending,
    error,
    selectedDate,
}: {
    add: (input: CreateObservationInput) => Promise<boolean>
    pending: boolean
    error: string
    selectedDate?: string | null
}) {
    const { activeLogger, closeLogger } = useLogger()
    const [feedback, setFeedback] = useState<string | null>(null)

    useEffect(() => {
        if (!feedback) return
        const timeout = window.setTimeout(() => setFeedback(null), 2200)
        return () => window.clearTimeout(timeout)
    }, [feedback])

    return (
        <>
            {activeLogger === 'food' && (
                <FoodLogger
                    opened
                    close={closeLogger}
                    selectedDate={selectedDate}
                    onFeedback={setFeedback}
                />
            )}
            {activeLogger && activeLogger !== 'food' && (
                <ManualEntryLogger
                    key={activeLogger}
                    opened
                    close={closeLogger}
                    add={add}
                    pending={pending}
                    serverError={error}
                    initialKind={kinds[activeLogger]}
                    selectedDate={selectedDate}
                />
            )}
            {feedback && (
                <div className="food-log-toast" role="status">
                    <IconCircleCheck size={17} />
                    <span>{feedback}</span>
                </div>
            )}
        </>
    )
}
