import type { FastifyInstance } from 'fastify'
import {
    maintenanceDateRangeSchema,
    providerRecordMaintenanceSchema,
    type MaintenanceDateRange,
    type ProviderRecordMaintenanceRange,
} from './maintenance-range.js'

type ProjectionMaintenance = {
    rebuild(input?: MaintenanceDateRange): Promise<{ queuedDates: number }>
}

type ProviderRecordMaintenance = {
    rederive(input?: ProviderRecordMaintenanceRange): Promise<{
        sourceRecords: number
        canonicalObservations: number
        queuedProjectionDates: number
    }>
}

export async function registerDataMaintenanceRoutes(
    app: FastifyInstance,
    services: {
        projections: ProjectionMaintenance
        providerRecords: ProviderRecordMaintenance
    },
) {
    app.post('/api/data/rebuild-projections', async (request, reply) => {
        const range = maintenanceDateRangeSchema.safeParse(request.body ?? {})
        if (!range.success) return reply.code(400).send({ error: 'invalid_range' })
        return { data: await services.projections.rebuild(range.data) }
    })

    app.post('/api/data/rederive-observations', async (request, reply) => {
        const range = providerRecordMaintenanceSchema.safeParse(request.body ?? {})
        if (!range.success) return reply.code(400).send({ error: 'invalid_range' })
        return { data: await services.providerRecords.rederive(range.data) }
    })
}
