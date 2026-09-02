import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { DailyProjectionCoordinator } from '../data/projection-coordinator.js'
import { DeviceService as DeviceServiceCore } from './service-core.js'

export type { DeviceAuthenticationFailure } from './service-core.js'

type Database = PostgresJsDatabase<typeof schemaType>

/**
 * Device ingestion with projection invalidation policy layered over the transactional sync core.
 */
export class DeviceService extends DeviceServiceCore {
    private readonly projections: DailyProjectionCoordinator

    constructor(database: Database, serverIdentity: string) {
        super(database, serverIdentity)
        this.projections = new DailyProjectionCoordinator(database)
    }

    override async uploadHealthRecords(
        ...args: Parameters<DeviceServiceCore['uploadHealthRecords']>
    ) {
        const result = await super.uploadHealthRecords(...args)
        await this.projections.invalidateCarryForwardDependents()
        return result
    }

    override async rebuildHealthRecordObservations() {
        const result = await super.rebuildHealthRecordObservations()
        await this.projections.invalidateCarryForwardDependents()
        return result
    }

    override async reconcileHealthRecords(
        ...args: Parameters<DeviceServiceCore['reconcileHealthRecords']>
    ) {
        const result = await super.reconcileHealthRecords(...args)
        await this.projections.invalidateCarryForwardDependents()
        return result
    }
}
