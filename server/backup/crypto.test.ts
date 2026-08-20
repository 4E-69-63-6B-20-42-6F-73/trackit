import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptBackup, encryptBackup } from './crypto.js'

describe('encrypted backup archive', () => {
    it('round-trips data and rejects the wrong external key', () => {
        const key = randomBytes(32)
        const archive = encryptBackup(Buffer.from('private database dump'), key)
        expect(archive.includes(Buffer.from('private database dump'))).toBe(false)
        expect(decryptBackup(archive, key).toString()).toBe('private database dump')
        expect(() => decryptBackup(archive, randomBytes(32))).toThrow()
    })
})
