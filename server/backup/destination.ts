import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

export interface BackupDestination {
    write(filename: string, data: Buffer): Promise<void>
    read(filename: string): Promise<Buffer>
    list(): Promise<string[]>
    removeAll(): Promise<number>
}

export class LocalBackupDestination implements BackupDestination {
    constructor(private readonly directory: string) {}

    private safePath(filename: string) {
        const safeName = basename(filename)
        if (safeName !== filename || !safeName.endsWith('.dump.enc')) {
            throw new Error('invalid_filename')
        }
        return join(this.directory, safeName)
    }

    async write(filename: string, data: Buffer) {
        await mkdir(this.directory, { recursive: true })
        await writeFile(this.safePath(filename), data, { mode: 0o600 })
    }

    async read(filename: string) {
        return readFile(this.safePath(filename))
    }

    async list() {
        await mkdir(this.directory, { recursive: true })
        return (await readdir(this.directory)).filter(filename => filename.endsWith('.dump.enc'))
    }

    async removeAll() {
        const filenames = await this.list()
        for (const filename of filenames) await unlink(this.safePath(filename))
        return filenames.length
    }
}
