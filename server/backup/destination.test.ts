import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalBackupDestination } from './destination.js'

let temporaryDirectory = ''

afterEach(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
})

describe('local backup destination', () => {
    it('stores mode-private archives and purges only encrypted backup files', async () => {
        temporaryDirectory = await mkdtemp(join(tmpdir(), 'trackit-backup-test-'))
        const destination = new LocalBackupDestination(temporaryDirectory)
        await destination.write('test.dump.enc', Buffer.from('encrypted'))

        expect(await destination.list()).toEqual(['test.dump.enc'])
        expect(await readFile(join(temporaryDirectory, 'test.dump.enc'), 'utf8')).toBe('encrypted')
        expect(await destination.removeAll()).toBe(1)
        expect(await destination.list()).toEqual([])
    })

    it('rejects paths outside the configured destination', async () => {
        temporaryDirectory = await mkdtemp(join(tmpdir(), 'trackit-backup-test-'))
        const destination = new LocalBackupDestination(temporaryDirectory)
        await expect(destination.read('../private.dump.enc')).rejects.toThrow('invalid_filename')
    })
})
