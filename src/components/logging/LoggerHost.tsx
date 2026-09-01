import { useToast } from '../toastContext'
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
    selectedDate,
}: {
    add: (input: CreateObservationInput) => void
    selectedDate?: string | null
}) {
    const { activeLogger, closeLogger } = useLogger()
    const toast = useToast()
    const addWithFeedback = (input: CreateObservationInput) => {
        add(input)
        if (activeLogger && activeLogger !== 'food') toast.success(feedback[activeLogger])
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
                    initialKind={kinds[activeLogger]}
                    selectedDate={selectedDate}
                />
            )}
        </>
    )
}
