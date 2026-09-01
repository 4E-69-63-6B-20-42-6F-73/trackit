import { useMutation } from '@tanstack/react-query'
import {
    createObservation,
    deleteObservation,
    updateObservation,
    type CreateObservationInput,
    type UpdateObservationInput,
} from '../lib/observationApi'

type Command = {
    run: () => Promise<unknown>
    message: string
}

export function useObservationCommands() {
    const commandMutation = useMutation({
        mutationFn: (command: Command) => command.run(),
        onSuccess: () => {
            window.dispatchEvent(new Event('trackit:observations-changed'))
        },
    })

    const run = async (command: Command) => {
        try {
            await commandMutation.mutateAsync(command)
            return true
        } catch {
            return false
        }
    }

    const add = (input: CreateObservationInput) => {
        void run({
            run: () => createObservation(input),
            message: 'The observation was not saved. Reconnect and retry.',
        })
    }
    const update = (id: string, input: UpdateObservationInput) =>
        run({
            run: () => updateObservation(id, input),
            message: 'The observation edit was not saved. Reconnect and retry.',
        })
    const remove = (id: string) => {
        void run({
            run: () => deleteObservation(id),
            message: 'The observation was not deleted. Reconnect and retry.',
        })
    }
    const retryCommand = () => {
        if (commandMutation.variables) void run(commandMutation.variables)
    }

    return {
        add,
        update,
        remove,
        commandFailure: commandMutation.isError ? (commandMutation.variables?.message ?? '') : '',
        commandPending: commandMutation.isPending,
        retryCommand,
    }
}
