import type { DataRepository } from '../data/types.js'

const escapeCsv = (value: unknown) => {
    const text =
        value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    return `"${text.replaceAll('"', '""')}"`
}

export class ExportService {
    constructor(private readonly data: DataRepository) {}

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
        ])
        return {
            schema: 'net.trackit.export',
            version: 2,
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
