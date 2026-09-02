import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { preferences } from '../db/schema.js'
import { resolveMaintenanceDateRange, type MaintenanceDateRange } from './maintenance-range.js'
import { DailyProjectionCoordinator } from './projection-coordinator.js'

type Database = PostgresJsDatabase<typeof schemaType>

export class ProjectionMaintenanceService {
    private readonly coordinator: DailyProjectionCoordinator

    constructor(private readonly database: Database) {
        this.coordinator = new DailyProjectionCoordinator(database)
    }

    async rebuild(input: MaintenanceDateRange = {}) {
        const [saved] = await this.database
            .select({ timezone: preferences.timezone })
            .from(preferences)
            .where(eq(preferences.id, 'owner'))
        const range = resolveMaintenanceDateRange(input, saved?.timezone ?? 'UTC')
        const dates = await this.coordinator.knownDates(range)
        await this.coordinator.invalidateDates(dates)
        return { queuedDates: dates.size }
    }
}
