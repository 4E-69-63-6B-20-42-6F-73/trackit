import { execFile as execFileCallback, spawn } from 'node:child_process'
import { createCipheriv, randomBytes } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'
import { desc, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schemaType from '../db/schema.js'
import { backupRuns } from '../db/schema.js'
import { backupKey, decryptBackup } from './crypto.js'
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
        const encryptedPath = join(this.directory, `.trackit-${timestamp}.enc.tmp`)
        const [run] = await this.database
            .insert(backupRuns)
            .values({ filename, status: 'running' })
            .returning()
        try {
            const iv = randomBytes(12)
            const cipher = createCipheriv('aes-256-gcm', key, iv)
            const handle = await open(encryptedPath, 'wx', 0o600)
            const child = spawn(
                'pg_dump',
                ['--format=custom', '--no-owner', '--no-privileges', this.databaseUrl],
                { stdio: ['ignore', 'pipe', 'pipe'] },
            )
            let diagnostic = ''
            child.stderr.on('data', chunk => {
                diagnostic += String(chunk)
            })
            try {
                await handle.write(
                    Buffer.concat([Buffer.from('TRKITB01'), iv, Buffer.alloc(16)]),
                    0,
                    36,
                    0,
                )
                const output = createWriteStream(encryptedPath, {
                    fd: handle.fd,
                    start: 36,
                    autoClose: false,
                })
                const exit = new Promise<void>((resolve, reject) =>
                    child.once('close', code =>
                        code === 0
                            ? resolve()
                            : reject(new Error(diagnostic || `pg_dump exited ${code}`)),
                    ),
                )
                await Promise.all([pipeline(child.stdout, cipher, output), exit])
                await handle.write(cipher.getAuthTag(), 0, 16, 20)
            } finally {
                await handle.close()
            }
            const encrypted = await readFile(encryptedPath)
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
            await unlink(encryptedPath).catch(() => undefined)
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
