export type Page = 'Today' | 'Journal' | 'Trends' | 'Goals' | 'Library' | 'Settings'

export type Category = 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'

export type SleepStageDetail = {
    type: 'awake' | 'rem' | 'light' | 'deep' | 'unknown'
    start: string
    end: string
}

export type JournalDetailView = {
    kind: 'sleep'
    stages: SleepStageDetail[]
}

export type JournalEvent = {
    id: string
    definitionId: string
    time: string
    category: Category
    title: string
    detail: string
    source: string
    deviceName?: string
    observedAt: string
    startedAt?: string
    endedAt?: string
    version?: number
    detailView?: JournalDetailView
}
