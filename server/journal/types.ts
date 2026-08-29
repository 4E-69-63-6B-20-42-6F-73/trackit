import { z } from 'zod'

export const categorySchema = z.enum(['Meals', 'Activity', 'Sleep', 'Measurements', 'Check-ins'])

export type JournalEntityLink = {
    entityType?: 'meal' | 'observation' | 'health_record'
    entityId?: string
}

export type SleepStageDetail = {
    type: 'awake' | 'rem' | 'light' | 'deep' | 'unknown'
    start: string
    end: string
}

export type JournalDetailView = {
    kind: 'sleep'
    stages: SleepStageDetail[]
}

export type JournalEntry = {
    id: string
    definitionId: string
    category: z.infer<typeof categorySchema>
    title: string
    detail: string
    source: string
    observedAt: string
    startedAt?: string
    endedAt?: string
    externalId?: string
    version: number
    createdAt: string
    updatedAt: string
    deviceName?: string
    detailView?: JournalDetailView
} & JournalEntityLink

export type JournalListQuery = {
    from?: string
    to?: string
    before?: string
    category?: JournalEntry['category']
    source?: string
    limit?: number
}

export interface JournalRepository {
    list(query?: JournalListQuery): Promise<JournalEntry[]>
    ready(): Promise<boolean>
}
