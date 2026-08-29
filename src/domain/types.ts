export type Page = 'Today' | 'Journal' | 'Trends' | 'Goals' | 'Library' | 'Connections' | 'Settings'

export type Category = 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'

export type JournalEvent = {
    id: string
    time: string
    category: Category
    title: string
    detail: string
    source: string
    deviceName?: string
    observedAt?: string
    version?: number
}
