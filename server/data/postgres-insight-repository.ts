import { eq, isNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { planItems, plannedMeals } from '../planning/schema.js'
import { listMetricCoverage } from './metric-coverage.js'
import { PostgresDataRepository } from './postgres-repository.js'
import type { RecordRange } from './types.js'

type Database = PostgresJsDatabase<typeof schemaType>

export class PostgresInsightDataRepository extends PostgresDataRepository {
    constructor(private readonly insightDatabase: Database) {
        super(insightDatabase)
    }

    listMetricCoverage(range: RecordRange = {}) {
        return listMetricCoverage(this.insightDatabase, range)
    }

    listPlanItems() {
        return this.insightDatabase
            .select({ planItem: planItems, meal: plannedMeals })
            .from(planItems)
            .innerJoin(plannedMeals, eq(plannedMeals.planItemId, planItems.id))
            .where(isNull(planItems.deletedAt))
            .orderBy(planItems.scheduledDate, planItems.position, planItems.createdAt)
    }
}
