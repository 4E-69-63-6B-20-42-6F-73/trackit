import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import staticFiles from '@fastify/static'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createApp } from './app.js'
import { AuthService } from './auth/service.js'
import { config } from './config.js'
import { db, sql } from './db/client.js'
import { registerEntryDeletionRoutes } from './data/entry-deletion-routes.js'
import { PostgresInsightDataRepository } from './data/postgres-insight-repository.js'
import { PostgresJournalRepository } from './journal/postgres-repository.js'
import { registerJournalDetailRoutes } from './journal/routes.js'
import { McpAccessService } from './mcp/service.js'
import { registerMcpBrowserCors } from './mcp/browser-cors.js'
import { DeviceService } from './devices/service.js'
import { DataDeletionService } from './data-lifecycle/deletion.js'
import { FoodCatalogService } from './nutrition/catalog.js'
import { registerFoodCategoryRoutes } from './nutrition/food-categories.js'
import { registerFoodLibraryRoutes } from './nutrition/food-library.js'
import { ProjectionWorker } from './data/projection-state.js'
import { ProjectionMaintenanceService } from './data/projection-maintenance.js'
import { registerDataMaintenanceRoutes } from './data/maintenance-routes.js'
import { ProviderRecordMaintenanceService } from './health-records/maintenance.js'
import { registerRecurringPlanRoutes } from './planning/recurrence.js'
import { registerPlanRoutes } from './planning/routes.js'

await migrate(db, { migrationsFolder: './server/db/migrations' })

const deletion = new DataDeletionService(db)
const projections = new ProjectionWorker(db)
const projectionMaintenance = new ProjectionMaintenanceService(db)
const providerRecordMaintenance = new ProviderRecordMaintenanceService(db)
const mcp = new McpAccessService(db)
const data = new PostgresInsightDataRepository(db)
const journal = new PostgresJournalRepository(db)
projections.start()

const app = await createApp(journal, {
    logger: true,
    dataRepository: data,
    auth: new AuthService(db),
    mcp,
    devices: new DeviceService(db, config.WEB_ORIGIN),
    deletion,
    trustProxy: config.TRUST_PROXY,
    bootstrapSecret: config.BOOTSTRAP_SECRET,
    database: db,
    foodCatalog: config.FOOD_CATALOG_URL
        ? new FoodCatalogService(config.FOOD_CATALOG_URL)
        : undefined,
})

registerMcpBrowserCors(app, mcp)
registerJournalDetailRoutes(app, journal)
registerFoodCategoryRoutes(app, db)
registerFoodLibraryRoutes(app, db)
registerRecurringPlanRoutes(app, db)
registerPlanRoutes(app, db)
registerEntryDeletionRoutes(app, db, data)

await registerDataMaintenanceRoutes(app, {
    projections: projectionMaintenance,
    providerRecords: providerRecordMaintenance,
})

const webRoot = resolve('dist')

if (existsSync(webRoot)) {
    await app.register(staticFiles, {
        root: webRoot,
        setHeaders(response, path) {
            if (path.includes(`${resolve('dist', 'assets')}`))
                response.header('Cache-Control', 'public, max-age=31536000, immutable')
        },
    })
    app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api/') || request.url.startsWith('/assets/')) {
            return reply.code(404).send({ error: 'not_found' })
        }
        return reply.sendFile('index.html')
    })
}

await app.listen({ host: config.HOST, port: config.PORT })

const shutdown = async () => {
    projections.stop()
    await app.close()
    await sql.end()
}
process.once('SIGTERM', () => void shutdown())
process.once('SIGINT', () => void shutdown())
