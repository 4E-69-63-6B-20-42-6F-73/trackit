import {
    IconApple,
    IconDroplet,
    IconMoodSmile,
    IconNotebook,
    IconScale,
    IconHeartbeat,
    type Icon,
} from '@tabler/icons-react'

export type LogActionId = 'food' | 'water' | 'weight' | 'energy' | 'symptom' | 'journal'

export type LogAction = {
    id: LogActionId
    label: string
    description: string
    keywords: string[]
    icon: Icon
}

export const logActions: readonly LogAction[] = [
    {
        id: 'food',
        label: 'Food or meal',
        description: 'Log something you ate or drank',
        keywords: ['meal', 'breakfast', 'lunch', 'dinner', 'snack', 'nutrition'],
        icon: IconApple,
    },
    {
        id: 'weight',
        label: 'Weight',
        description: 'Record a body weight measurement',
        keywords: ['body', 'measurement', 'scale'],
        icon: IconScale,
    },
    {
        id: 'water',
        label: 'Water',
        description: 'Record water intake',
        keywords: ['hydration', 'drink'],
        icon: IconDroplet,
    },
    {
        id: 'energy',
        label: 'Energy check-in',
        description: 'Record how your energy feels',
        keywords: ['mood', 'wellbeing', 'check-in'],
        icon: IconMoodSmile,
    },
    {
        id: 'symptom',
        label: 'Symptom',
        description: 'Record a symptom and its context',
        keywords: ['pain', 'headache', 'check-in'],
        icon: IconHeartbeat,
    },
    {
        id: 'journal',
        label: 'Note',
        description: 'Write something you want to remember',
        keywords: ['journal', 'note', 'context'],
        icon: IconNotebook,
    },
]
