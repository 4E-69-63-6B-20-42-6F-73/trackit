import { toast } from '../toast'
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

const feedback: Record<Exclude<LogActionId, 'food'>, string> = {
    water: 'Water logged.',
    weight: 'Weight saved.',
    energy: 'Check-in saved.',
    symptom: 'Symptom saved.',
    journal: 'Note saved.',
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
    const addWithFeedback = async (input: CreateObservationInput) => {
        const saved = await add(input)
        if (saved && activeLogger && activeLogger !== 'food') toast.success(feedback[activeLogger])
        return saved
    }

    return (
        <>
            {activeLogger === 'food' && (
                <FoodLogger
                    opened
                    close={closeLogger}
                    selectedDate={selectedDate}
                    onFeedback={toast.success}
                />
            )}
            {activeLogger && activeLogger !== 'food' && (
                <ManualEntryLogger
                    key={activeLogger}
                    opened
                    close={closeLogger}
                    add={addWithFeedback}
                    pending={pending}
                    serverError={error}
                    initialKind={kinds[activeLogger]}
                    selectedDate={selectedDate}
                />
            )}
        </>
    )
}
