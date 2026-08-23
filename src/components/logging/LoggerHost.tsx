import type { JournalEvent } from '../../domain/types'
import { useLogger } from '../../logging/LoggingContext'
import type { LogActionId } from '../../logging/logActions'
import { ManualEntryLogger, type ManualEntryKind } from '../QuickAdd'
import { FoodLogger } from './FoodLogger'

const kinds: Record<Exclude<LogActionId, 'food'>, ManualEntryKind> = {
    water: 'Water',
    weight: 'Weight',
    energy: 'Check-in',
    journal: 'Note',
}

export function LoggerHost({
    add,
    selectedDate,
}: {
    add: (event: JournalEvent, allowDuplicate?: boolean) => boolean | void
    selectedDate?: string | null
}) {
    const { activeLogger, closeLogger } = useLogger()
    if (!activeLogger) return null
    if (activeLogger === 'food') {
        return <FoodLogger opened close={closeLogger} selectedDate={selectedDate} />
    }
    return (
        <ManualEntryLogger
            key={activeLogger}
            opened
            close={closeLogger}
            add={add}
            initialKind={kinds[activeLogger]}
            selectedDate={selectedDate}
        />
    )
}
