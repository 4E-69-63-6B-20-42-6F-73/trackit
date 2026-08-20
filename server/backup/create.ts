import { BackupService } from './service.js'
import { config } from '../config.js'
import { db } from '../db/client.js'

const backup = new BackupService(
    db,
    config.DATABASE_URL,
    config.BACKUP_DIR,
    config.BACKUP_ENCRYPTION_KEY,
)
const record = await backup.create()
process.stdout.write(`${record.filename}\n`)
process.exit(0)
