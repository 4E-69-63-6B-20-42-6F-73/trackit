export type Page = 'Today' | 'Nutrition' | 'Journal' | 'Trends' | 'Connections' | 'Settings'

export type Category = 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'

export type JournalEvent = {
    id: string
    time: string
    category: Category
    title: string
    detail: string
    source: string
    observation?: {
        metric: string
        value: number
        unit: string
        observedAt: string
    }
}
