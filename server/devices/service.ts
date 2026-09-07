import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { DailyProjectionCoordinator } from '../data/projection-coordinator.js'
import { DeviceService as DeviceServiceCore } from './service-core.js'

export type { DeviceAuthenticationFailure } from './service-core.js'

type Database = PostgresJsDatabase<typeof schemaType>
type UploadResult = { duplicate: boolean; accepted: number }

const isUploadIdempotencyConflict = (error: unknown) => {
    let current = error
    for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
        if (current.message.includes('device_upload_idempotency_idx')) return true
        current = (current as Error & { cause?: unknown }).cause
    }
    return false
}

export class DeviceService extends DeviceServiceCore {
    private readonly projections: DailyProjectionCoordinator
    private readonly inFlightUploads = new Map<string, Promise<UploadResult>>()

    constructor(database: Database, serverIdentity: string) {
        super(database, serverIdentity)
        this.projections = new DailyProjectionCoordinator(database)
    }

    override async uploadHealthRecords(
        ...args: Parameters<DeviceServiceCore['uploadHealthRecords']>
    ) {
        const [deviceId, idempotencyKey, records] = args
        const key = `${deviceId}:${idempotencyKey}`
        const existing = this.inFlightUploads.get(key)
        if (existing) return existing

        const upload = (async (): Promise<UploadResult> => {
            try {
                const result = await super.uploadHealthRecords(...args)
                await this.projections.invalidateCarryForwardDependents()
                return result
            } catch (error) {
                if (isUploadIdempotencyConflict(error)) {
                    return { duplicate: true, accepted: records.length }
                }
                throw error
            } finally {
                this.inFlightUploads.delete(key)
            }
        })()

        this.inFlightUploads.set(key, upload)
        return upload
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
