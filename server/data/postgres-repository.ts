import { and, desc, eq, gte, lte } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { dailyMetrics, observations } from '../db/schema.js'
import { dateKeyInTimezone } from './timezone.js'
import { DailyProjectionCoordinator } from './projection-coordinator.js'
import { PostgresDataRepository as PersistenceDataRepository } from './postgres-repository-core.js'
import type { DataRepository } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

type ObservationImpact = Pick<
    typeof observations.$inferSelect,
    'definitionId' | 'observedAt' | 'endedAt'
>

/**
 * Application repository with projection policy layered over persistence.
 *
 * The persistence core still owns CRUD transactions. This class owns when projection state is
 * refreshed or invalidated, and keeps daily metric reads side-effect free.
 */
export class PostgresDataRepository extends PersistenceDataRepository implements DataRepository {
    private readonly projections: DailyProjectionCoordinator

    constructor(private readonly projectionDatabase: Database) {
        super(projectionDatabase)
        this.projections = new DailyProjectionCoordinator(projectionDatabase)
    }

    async listDailyMetrics(range: { from?: string; to?: string } = {}) {
        const conditions: SQL[] = []
        if (range.from) conditions.push(gte(dailyMetrics.date, range.from))
        if (range.to) conditions.push(lte(dailyMetrics.date, range.to))
        return this.projectionDatabase
            .select()
            .from(dailyMetrics)
            .where(conditions.length ? and(...conditions) : undefined)
            .orderBy(desc(dailyMetrics.date))
    }

    override async createObservation(
        input: Parameters<PersistenceDataRepository['createObservation']>[0],
    ) {
        const saved = await super.createObservation(input)
        if (saved?.valueType === 'number' && saved.definitionId === 'height')
            await this.projections.refreshObservations([saved])
        return saved
    }

    override async updateObservation(
        id: string,
        input: Parameters<PersistenceDataRepository['updateObservation']>[1],
    ) {
        const [before] = await this.projectionDatabase
            .select({
                definitionId: observations.definitionId,
                observedAt: observations.observedAt,
                endedAt: observations.endedAt,
                valueType: observations.valueType,
            })
            .from(observations)
            .where(eq(observations.id, id))
        const saved = await super.updateObservation(id, input)
        if (saved && before?.valueType === 'number' && before.definitionId === 'height') {
            const impacts: ObservationImpact[] = [
                {
                    definitionId: before.definitionId,
                    observedAt: before.observedAt,
                    endedAt: before.endedAt,
                },
                {
                    definitionId: saved.definitionId,
                    observedAt: saved.observedAt,
                    endedAt: saved.endedAt,
                },
            ]
            await this.projections.refreshObservations(impacts)
        }
        return saved
    }

    override async removeObservation(id: string) {
        const [before] = await this.projectionDatabase
            .select({
                definitionId: observations.definitionId,
                observedAt: observations.observedAt,
                endedAt: observations.endedAt,
                valueType: observations.valueType,
            })
            .from(observations)
            .where(eq(observations.id, id))
        const removed = await super.removeObservation(id)
        if (removed && before?.valueType === 'number' && before.definitionId === 'height')
            await this.projections.refreshObservations([before])
        return removed
    }

    override async updatePreferences(
        input: Parameters<PersistenceDataRepository['updatePreferences']>[0],
    ) {
        const before = await this.getPreferences()
        const saved = await super.updatePreferences(input)
        if (saved.metricResolutionVersion !== before.metricResolutionVersion) {
            await this.projections.invalidateAll()
            await this.projections.refreshDates([
                dateKeyInTimezone(new Date(), saved.timezone ?? 'UTC'),
            ])
        }
        return saved
    }
}
