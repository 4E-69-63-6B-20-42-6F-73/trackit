import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const magic = Buffer.from('TRKITB01')

export function backupKey(encoded: string) {
    const key = Buffer.from(encoded, 'base64')
    if (key.length !== 32)
        throw new Error('BACKUP_ENCRYPTION_KEY must be 32 random bytes in base64')
    return key
}

export function encryptBackup(plaintext: Buffer, key: Buffer) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
    return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext])
}

export function decryptBackup(archive: Buffer, key: Buffer) {
    if (!archive.subarray(0, magic.length).equals(magic)) throw new Error('Invalid backup format')
    const iv = archive.subarray(8, 20)
    const tag = archive.subarray(20, 36)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(archive.subarray(36)), decipher.final()])
}
