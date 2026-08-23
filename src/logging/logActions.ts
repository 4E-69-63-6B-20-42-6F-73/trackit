import {
    IconApple,
    IconDroplet,
    IconMoodSmile,
    IconNotebook,
    IconScale,
    type Icon,
} from '@tabler/icons-react'

export type LogActionId = 'food' | 'water' | 'weight' | 'energy' | 'journal'

export type LogAction = {
    id: LogActionId
    label: string
    icon: Icon
}

export const logActions: readonly LogAction[] = [
    { id: 'food', label: 'Food', icon: IconApple },
    { id: 'water', label: 'Water', icon: IconDroplet },
    { id: 'weight', label: 'Weight', icon: IconScale },
    { id: 'energy', label: 'Energy', icon: IconMoodSmile },
    { id: 'journal', label: 'Journal', icon: IconNotebook },
]
