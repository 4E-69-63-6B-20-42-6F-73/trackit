import { useState } from 'react'
import {
    createObservation,
    deleteObservation,
    updateObservation,
    type CreateObservationInput,
    type UpdateObservationInput,
} from '../lib/observationApi'

export function useObservationCommands() {
    const [failure, setFailure] = useState<{ message: string; retry: () => Promise<void> } | null>(
        null,
    )
    const run = async (command: () => Promise<void>, message: string) => {
        try {
            await command()
            setFailure(null)
            window.dispatchEvent(new Event('trackit:observations-changed'))
            return true
        } catch {
            setFailure({ message, retry: async () => void (await run(command, message)) })
            return false
        }
    }
    const add = (input: CreateObservationInput) => {
        void run(
            () => createObservation(input),
            'The observation was not saved. Reconnect and retry.',
        )
    }
    const update = (id: string, input: UpdateObservationInput) =>
        run(
            () => updateObservation(id, input),
            'The observation edit was not saved. Reconnect and retry.',
        )
    const remove = (id: string) => {
        void run(
            () => deleteObservation(id),
            'The observation was not deleted. Reconnect and retry.',
        )
    }
    return {
        add,
        update,
        remove,
        commandFailure: failure?.message ?? '',
        retryCommand: () => void failure?.retry(),
    }
}
