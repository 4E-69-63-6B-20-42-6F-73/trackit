export type Page = 'Today' | 'Plan' | 'Journal' | 'Trends' | 'Goals' | 'Library' | 'Settings'

export type Category = 'Meals' | 'Activity' | 'Sleep' | 'Measurements' | 'Check-ins'

export type SleepStageDetail = {
    type: 'awake' | 'rem' | 'light' | 'deep' | 'unknown'
    start: string
    end: string
}

export type MealServingDetail = {
    amount: number
    unit: 'g' | 'serving'
}

export type MealSourceItem = {
    kind: 'food' | 'recipe'
    id: string
}

export type JournalDetailView =
    | {
          kind: 'sleep'
          stages: SleepStageDetail[]
      }
    | {
          kind: 'meal'
          mealType: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack'
          serving?: MealServingDetail
          nutrients: Record<string, number>
          nutritionQuality: 'complete' | 'estimated' | 'incomplete'
          sourceItem?: MealSourceItem
      }

export type JournalEvent = {
    id: string
    definitionId: string
    entityType?: 'meal' | 'observation' | 'health_record'
    entityId?: string
    editable?: boolean
    time: string
    category: Category
    title: string
    detail: string
    source: string
    sourceRaw?: string
    deviceName?: string
    observedAt: string
    startedAt?: string
    endedAt?: string
    version?: number
    detailView?: JournalDetailView
}
