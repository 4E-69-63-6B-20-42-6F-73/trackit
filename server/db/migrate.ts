import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db, sql } from './client.js'

await migrate(db, { migrationsFolder: './server/db/migrations' })
await sql.end()
