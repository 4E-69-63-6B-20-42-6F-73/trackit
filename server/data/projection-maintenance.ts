import { and, eq, gte, isNull, lt, lte, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { dailyMetrics, dailyProjectionRuns, observations, preferences } from '../db/schema.js'
import { localDayRange } from './timezone.js'
import { markProjectionDatesDirty } from './projection-state.js'

type Database = PostgresJsDatabase<typeof schemaType>
export type MaintenanceDateRange = { from?: string; to?: string }

export class ProjectionMaintenanceService {
    constructor(private readonly database: Database) {}

    async rebuild(range: MaintenanceDateRange = {}) {
        const [saved] = await this.database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const timezone = saved?.timezone ?? 'UTC'

        const observationConditions: SQL[] = [isNull(observations.deletedAt)]
        if (range.from)
            observationConditions.push(
                gte(observations.observedAt, localDayRange(range.from, timezone).from),
            )
        if (range.to)
            observationConditions.push(
                lt(observations.observedAt, localDayRange(range.to, timezone).to),
            )

        const metricConditions: SQL[] = []
        const runConditions: SQL[] = [eq(dailyProjectionRuns.userId, 'owner')]
        if (range.from) {
            metricConditions.push(gte(dailyMetrics.date, range.from))
            runConditions.push(gte(dailyProjectionRuns.date, range.from))
        }
        if (range.to) {
            metricConditions.push(lte(dailyMetrics.date, range.to))
            runConditions.push(lte(dailyProjectionRuns.date, range.to))
        }

        const [observationDates, metricDates, runDates] = await Promise.all([
            this.database
                .selectDistinct({
                    date: sql<string>`to_char(${observations.observedAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
                })
                .from(observations)
                .where(and(...observationConditions)),
            this.database
                .selectDistinct({ date: dailyMetrics.date })
                .from(dailyMetrics)
                .where(metricConditions.length ? and(...metricConditions) : undefined),
            this.database
                .selectDistinct({ date: dailyProjectionRuns.date })
                .from(dailyProjectionRuns)
                .where(and(...runConditions)),
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
