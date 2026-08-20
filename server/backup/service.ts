import { execFile as execFileCallback } from 'node:child_process'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { desc, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { backupRuns } from '../db/schema.js'
import { backupKey, decryptBackup, encryptBackup } from './crypto.js'
import { LocalBackupDestination, type BackupDestination } from './destination.js'

type Database = PostgresJsDatabase<typeof schemaType>
const execFile = promisify(execFileCallback)

export class BackupService {
    private timer?: NodeJS.Timeout
    private readonly destination: BackupDestination

    constructor(
        private readonly database: Database,
        private readonly databaseUrl: string,
        private readonly directory: string,
        private readonly encodedKey?: string,
        destination?: BackupDestination,
    ) {
        this.destination = destination ?? new LocalBackupDestination(directory)
    }

    configured() {
        try {
            if (!this.encodedKey) return false
            backupKey(this.encodedKey)
            return true
        } catch {
            return false
        }
    }

    async create() {
        if (!this.encodedKey) throw new Error('backup_key_missing')
        const key = backupKey(this.encodedKey)
        await mkdir(this.directory, { recursive: true })
        const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
        const filename = `trackit-${timestamp}.dump.enc`
        const dumpPath = join(this.directory, `.trackit-${timestamp}.dump.tmp`)
        const [run] = await this.database
            .insert(backupRuns)
            .values({ filename, status: 'running' })
            .returning()
        try {
            await execFile('pg_dump', [
                '--format=custom',
                '--no-owner',
                '--no-privileges',
                '--file',
                dumpPath,
                this.databaseUrl,
            ])
            const encrypted = encryptBackup(await readFile(dumpPath), key)
            await this.destination.write(filename, encrypted)
            const [completed] = await this.database
                .update(backupRuns)
                .set({ status: 'complete', sizeBytes: encrypted.length, completedAt: new Date() })
                .where(eq(backupRuns.id, run.id))
                .returning()
            return completed
        } catch {
            await this.database
                .update(backupRuns)
                .set({
                    status: 'failed',
                    diagnostic: 'Backup command failed',
                    completedAt: new Date(),
                })
                .where(eq(backupRuns.id, run.id))
            throw new Error('backup_failed')
        } finally {
            await unlink(dumpPath).catch(() => undefined)
        }
    }

    async verify(filename: string) {
        if (!this.encodedKey) throw new Error('backup_key_missing')
        const safeName = basename(filename)
        if (safeName !== filename || !safeName.endsWith('.dump.enc'))
            throw new Error('invalid_filename')
        const dumpPath = join(this.directory, `.verify-${Date.now()}.dump.tmp`)
        try {
            const decrypted = decryptBackup(
                await this.destination.read(safeName),
                backupKey(this.encodedKey),
            )
            await writeFile(dumpPath, decrypted, { mode: 0o600 })
            await execFile('pg_restore', ['--list', dumpPath])
            await this.database
                .update(backupRuns)
                .set({ verifiedAt: new Date() })
                .where(eq(backupRuns.filename, safeName))
        } finally {
            await unlink(dumpPath).catch(() => undefined)
        }
    }

    async restore(filename: string) {
        if (!this.encodedKey) throw new Error('backup_key_missing')
        const safeName = basename(filename)
        if (safeName !== filename || !safeName.endsWith('.dump.enc'))
            throw new Error('invalid_filename')
        const dumpPath = join(this.directory, `.restore-${Date.now()}.dump.tmp`)
        try {
            const decrypted = decryptBackup(
                await this.destination.read(safeName),
                backupKey(this.encodedKey),
            )
            await writeFile(dumpPath, decrypted, { mode: 0o600 })
            await execFile('pg_restore', [
                '--clean',
                '--if-exists',
                '--no-owner',
                '--no-privileges',
                '--dbname',
                this.databaseUrl,
                dumpPath,
            ])
        } finally {
            await unlink(dumpPath).catch(() => undefined)
        }
    }

    async markRestoreVerified(filename: string) {
        const safeName = basename(filename)
        if (safeName !== filename || !safeName.endsWith('.dump.enc')) {
            throw new Error('invalid_filename')
        }
        await this.database
            .update(backupRuns)
            .set({
                status: 'complete',
                completedAt: new Date(),
                verifiedAt: new Date(),
                diagnostic: 'Clean restore completed and migrations applied',
            })
            .where(eq(backupRuns.filename, safeName))
    }

    list() {
        return this.database.select().from(backupRuns).orderBy(desc(backupRuns.createdAt)).limit(50)
    }

    async purge() {
        const removed = await this.destination.removeAll()
        await this.database
            .update(backupRuns)
            .set({ status: 'purged', diagnostic: 'Removed during requested data deletion' })
        return removed
    }

    start(intervalHours: number) {
        if (!this.configured() || this.timer) return
        this.timer = setInterval(
            () => void this.create().catch(() => undefined),
            intervalHours * 60 * 60 * 1000,
        )
        this.timer.unref()
    }
}
