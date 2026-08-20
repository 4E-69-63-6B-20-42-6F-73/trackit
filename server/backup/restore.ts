import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { BackupService } from './service.js'
import { config } from '../config.js'
import { db } from '../db/client.js'

const filename = process.argv[2]
if (!filename) throw new Error('Usage: npm run backup:restore -- <archive filename>')

const backup = new BackupService(
    db,
    config.DATABASE_URL,
    config.BACKUP_DIR,
    config.BACKUP_ENCRYPTION_KEY,
)
await backup.restore(filename)
await migrate(db, { migrationsFolder: './server/db/migrations' })
await backup.markRestoreVerified(filename)
process.stdout.write('Restore completed and migrations applied.\n')
process.exit(0)
