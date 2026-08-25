import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import staticFiles from '@fastify/static'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createApp } from './app.js'
import { AuthService } from './auth/service.js'
import { config } from './config.js'
import { db, sql } from './db/client.js'
import { PostgresDataRepository } from './data/postgres-repository.js'
import { PostgresJournalRepository } from './journal/postgres-repository.js'
import { McpAccessService } from './mcp/service.js'
import { DeviceService } from './devices/service.js'
import { BackupService } from './backup/service.js'
import { DataLifecycleService } from './data-lifecycle/service.js'
import { FoodCatalogService } from './nutrition/catalog.js'
import { ProjectionWorker } from './data/projection-state.js'

await migrate(db, { migrationsFolder: './server/db/migrations' })

const backup = new BackupService(
    db,
    config.DATABASE_URL,
    config.BACKUP_DIR,
    config.BACKUP_ENCRYPTION_KEY,
)
if (config.BACKUPS_ENABLED) backup.start(config.BACKUP_INTERVAL_HOURS)
const lifecycle = new DataLifecycleService(db)
lifecycle.start()
const projections = new ProjectionWorker(db)
projections.start()

const app = await createApp(new PostgresJournalRepository(db), {
    logger: true,
    dataRepository: new PostgresDataRepository(db),
    auth: new AuthService(db),
    mcp: new McpAccessService(db),
    devices: new DeviceService(db, config.WEB_ORIGIN),
    backup,
    lifecycle,
    trustProxy: config.TRUST_PROXY,
    bootstrapSecret: config.BOOTSTRAP_SECRET,
    database: db,
    foodCatalog: config.FOOD_CATALOG_URL
        ? new FoodCatalogService(config.FOOD_CATALOG_URL)
        : undefined,
})
const webRoot = resolve('dist')

if (existsSync(webRoot)) {
    await app.register(staticFiles, { root: webRoot })
    app.setNotFoundHandler((request, reply) => {
        if (request.url.startsWith('/api/')) {
            return reply.code(404).send({ error: 'not_found' })
        }
        return reply.sendFile('index.html')
    })
}

await app.listen({ host: config.HOST, port: config.PORT })

const shutdown = async () => {
    projections.stop()
    lifecycle.stop()
    await app.close()
    await sql.end()
}
process.once('SIGTERM', () => void shutdown())
process.once('SIGINT', () => void shutdown())
