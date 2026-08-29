import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
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
}
