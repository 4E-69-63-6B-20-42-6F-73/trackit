import type { DataRepository } from '../data/types.js'
import type { JournalRepository } from '../journal/types.js'

type PlanningExportRepository = DataRepository & {
    listPlanItems?: () => Promise<unknown[]>
}

const escapeCsv = (value: unknown) => {
    const text =
        value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    return `"${text.replaceAll('"', '""')}"`
}

export class ExportService {
    constructor(
        private readonly data: PlanningExportRepository,
        _journal: JournalRepository,
    ) {}

    async snapshot() {
        const [
            observations,
            preferences,
            foods,
            recipes,
            goals,
            trendViews,
            sources,
            healthRecords,
            dailyMetrics,
            planItems,
        ] = await Promise.all([
            this.data.listRawObservations?.() ?? this.data.listObservations(),
            this.data.getPreferences(),
            this.data.listFoods(),
            this.data.listRecipes(),
            this.data.listGoals(),
            this.data.listSavedTrendViews(),
            this.data.listSources(),
            this.data.listHealthRecords?.() ?? Promise.resolve([]),
            this.data.listDailyMetrics?.() ?? Promise.resolve([]),
            this.data.listPlanItems?.() ?? Promise.resolve([]),
        ])
        return {
            schema: 'net.trackit.export',
            version: 3,
            exportedAt: new Date().toISOString(),
            data: {
                observations,
                preferences,
                foods,
                recipes,
                goals,
                trendViews,
                sources,
                healthRecords,
                dailyMetrics,
                planItems,
            },
        }
    }

    async csv() {
        const snapshot = await this.snapshot()
        const rows = [['collection', 'record']]
        for (const [collection, records] of Object.entries(snapshot.data)) {
            const values = Array.isArray(records) ? records : [records]
            for (const record of values) rows.push([collection, JSON.stringify(record)])
        }
        return rows.map(row => row.map(escapeCsv).join(',')).join('\n')
    }
}
