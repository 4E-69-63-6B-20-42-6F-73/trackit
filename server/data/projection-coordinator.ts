import { and, eq, gte, isNotNull, isNull, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import {
    calendarDateKey as dateKeyInTimezone,
    calendarDayRangeForKey as localDayRange,
} from '@trackit/domain/calendar'
import type * as schemaType from '../db/schema.js'
import {
    dailyMetrics,
    dailyProjectionRuns,
    observations,
    preferences,
    projectionDirtyDates,
} from '../db/schema.js'
import {
    EFFECTIVE_DAILY_DERIVATION_VERSION,
    rebuildEffectiveDailyMetric,
} from './daily-projection.js'
import { markProjectionDatesDirty } from './projection-queue.js'

type Database = PostgresJsDatabase<typeof schemaType>
type ProjectionDateRange = { from?: string; to?: string }

type ProjectionObservation = Pick<
    typeof observations.$inferSelect,
    'definitionId' | 'observedAt' | 'endedAt'
>

type ProjectionContext = {
    timezone: string
    resolutionVersion: number
}

const projectionDate = (record: ProjectionObservation, timezone: string) =>
    dateKeyInTimezone(
        record.definitionId.startsWith('sleep') && record.endedAt
            ? record.endedAt
            : record.observedAt,
        timezone,
    )

const inRange = (date: string, range: ProjectionDateRange) =>
    (!range.from || date >= range.from) && (!range.to || date <= range.to)

/**
 * Owns projection invalidation and reconciliation policy.
 *
 * Repositories should either refresh the dates affected by an interactive mutation or queue them
 * for the worker. Read methods must not discover or repair projection state.
 */
export class DailyProjectionCoordinator {
    constructor(private readonly database: Database) {}

    private async context(): Promise<ProjectionContext> {
        const [saved] = await this.database
            .select({
                timezone: preferences.timezone,
                resolutionVersion: preferences.metricResolutionVersion,
            })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        return {
            timezone: saved?.timezone ?? 'UTC',
            resolutionVersion: saved?.resolutionVersion ?? 1,
        }
    }

    private async attributedObservationDates(timezone: string) {
        const attributedAt = sql<Date>`case
            when ${observations.definitionId} like 'sleep%' and ${observations.endedAt} is not null
                then ${observations.endedAt}
            else ${observations.observedAt}
        end`
        return this.database
            .selectDistinct({
                date: sql<string>`to_char(${attributedAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
            })
            .from(observations)
            .where(
                and(
                    isNull(observations.deletedAt),
                    eq(observations.valueType, 'number'),
                    isNotNull(observations.canonicalValue),
                ),
            )
    }

    async knownDates(range: ProjectionDateRange = {}) {
        const { timezone } = await this.context()
        const [observationDates, metricDates, runDates] = await Promise.all([
            this.attributedObservationDates(timezone),
            this.database.selectDistinct({ date: dailyMetrics.date }).from(dailyMetrics),
            this.database
                .selectDistinct({ date: dailyProjectionRuns.date })
                .from(dailyProjectionRuns)
                .where(eq(dailyProjectionRuns.userId, 'owner')),
        ])
        return new Set(
            [
                ...observationDates.map(item => item.date),
                ...metricDates.map(item => item.date),
                ...runDates.map(item => item.date),
            ].filter(date => inRange(date, range)),
        )
    }

    async dirtyDates() {
        return new Set(
            (
                await this.database
                    .select({ date: projectionDirtyDates.date })
                    .from(projectionDirtyDates)
                    .where(eq(projectionDirtyDates.userId, 'owner'))
            ).map(item => item.date),
        )
    }

    private async laterWeightDates(fromDate: string, timezone: string) {
        const weights = await this.database
            .select({ observedAt: observations.observedAt })
            .from(observations)
            .where(
                and(
                    isNull(observations.deletedAt),
                    eq(observations.definitionId, 'weight'),
                    gte(observations.observedAt, localDayRange(fromDate, timezone).from),
                ),
            )
        return new Set(weights.map(weight => dateKeyInTimezone(weight.observedAt, timezone)))
    }

    async observationImpactDates(records: ProjectionObservation[]) {
        if (!records.length) return new Set<string>()
        const { timezone } = await this.context()
        const dates = new Set<string>()
        for (const record of records) {
            dates.add(dateKeyInTimezone(record.observedAt, timezone))
            dates.add(projectionDate(record, timezone))
            if (record.endedAt) dates.add(dateKeyInTimezone(record.endedAt, timezone))
        }

        const changedHeights = records.filter(record => record.definitionId === 'height')
        if (changedHeights.length) {
            const earliestHeightDate = changedHeights
                .map(record => dateKeyInTimezone(record.observedAt, timezone))
                .sort()[0]
            for (const date of await this.laterWeightDates(earliestHeightDate, timezone))
                dates.add(date)
        }
        return dates
    }

    async invalidateDates(dates: Iterable<string>) {
        const uniqueDates = new Set(dates)
        await markProjectionDatesDirty(this.database, uniqueDates)
        return uniqueDates
    }

    async refreshDates(dates: Iterable<string>) {
        const queued = await this.invalidateDates(dates)
        for (const date of [...queued].sort())
            await rebuildEffectiveDailyMetric(this.database, date)
        return queued
    }

    async invalidateObservations(records: ProjectionObservation[]) {
        return this.invalidateDates(await this.observationImpactDates(records))
    }

    async refreshObservations(records: ProjectionObservation[]) {
        return this.refreshDates(await this.observationImpactDates(records))
    }

    /**
     * Bulk ingestion does not retain enough information after replacement/deletion to know whether
     * a dirty date contained a carry-forward height. Conservatively requeue later weight dates from
     * the earliest dirty date so cached BMI can never survive a historical bulk correction.
     */
    async invalidateCarryForwardDependents(dates?: Iterable<string>) {
        const dirty = [...new Set(dates ?? (await this.dirtyDates()))].sort()
        if (!dirty.length) return new Set<string>()
        const { timezone } = await this.context()
        return this.invalidateDates(await this.laterWeightDates(dirty[0], timezone))
    }

    async invalidateAll() {
        return this.invalidateDates(await this.knownDates())
    }

    async reconcile() {
        const { timezone, resolutionVersion } = await this.context()
        const [observationDates, rows, runs] = await Promise.all([
            this.attributedObservationDates(timezone),
            this.database.select().from(dailyMetrics),
            this.database
                .select()
                .from(dailyProjectionRuns)
                .where(eq(dailyProjectionRuns.userId, 'owner')),
        ])
        const runByDate = new Map(runs.map(run => [run.date, run]))
        const staleDates = new Set<string>()

        for (const item of observationDates) {
            if (!runByDate.has(item.date)) staleDates.add(item.date)
        }
        for (const run of runs) {
            if (
                run.status !== 'complete' ||
                run.derivationVersion !== EFFECTIVE_DAILY_DERIVATION_VERSION ||
                run.resolutionVersion !== resolutionVersion ||
                run.timezone !== timezone
            )
                staleDates.add(run.date)
        }
        for (const row of rows) {
            if (
                row.derivationVersion !== EFFECTIVE_DAILY_DERIVATION_VERSION ||
                row.resolutionVersion !== resolutionVersion ||
                row.timezone !== timezone
            )
                staleDates.add(row.date)
        }

        await markProjectionDatesDirty(this.database, staleDates)
        return { queuedDates: staleDates.size }
    }
}
