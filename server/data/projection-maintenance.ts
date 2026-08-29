import { eq, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import {
    dailyMetrics,
    dailyProjectionRuns,
    observations,
    preferences,
} from '../db/schema.js'
import { markProjectionDatesDirty } from './projection-state.js'

type Database = PostgresJsDatabase<typeof schemaType>

export class ProjectionMaintenanceService {
    constructor(private readonly database: Database) {}

    async rebuildAll() {
        const [saved] = await this.database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const timezone = saved?.timezone ?? 'UTC'

        const observationDates = await this.database
            .selectDistinct({
                date: sql<string>`to_char(${observations.observedAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
            })
            .from(observations)
            .where(isNull(observations.deletedAt))
        const [metricDates, runDates] = await Promise.all([
            this.database.selectDistinct({ date: dailyMetrics.date }).from(dailyMetrics),
            this.database
                .selectDistinct({ date: dailyProjectionRuns.date })
                .from(dailyProjectionRuns)
                .where(eq(dailyProjectionRuns.userId, 'owner')),
        ])

        const dates = new Set([
            ...observationDates.map(item => item.date),
            ...metricDates.map(item => item.date),
            ...runDates.map(item => item.date),
        ])
        await markProjectionDatesDirty(this.database, dates)

        return { queuedDates: dates.size }
    }
}
