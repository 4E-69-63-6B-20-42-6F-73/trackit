import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { AuthService } from './service.js'

describe('owner authentication', () => {
    it('hashes credentials and issues revocable opaque sessions', async () => {
        const client = new PGlite()
        for (const file of ['0000_handy_rattler.sql', '0001_noisy_leo.sql', '0002_mute_drax.sql']) {
            const migration = await readFile(`server/db/migrations/${file}`, 'utf8')
            await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
        }
        const database = drizzle(client, { schema })
        const auth = new AuthService(database as never)

        expect(await auth.configured()).toBe(false)
        const setup = await auth.setup('correct horse battery staple', {
            userAgent: 'test',
            ipAddress: '127.0.0.1',
        })
        expect(setup.recoveryCodes).toHaveLength(8)
        expect(await auth.configured()).toBe(true)
        expect(await auth.authenticate(setup.session.token)).not.toBeNull()
        expect(await auth.login('wrong password here', {})).toBeNull()

        const recovered = await auth.recover(setup.recoveryCodes[0], {})
        expect(recovered).not.toBeNull()
        expect(await auth.recover(setup.recoveryCodes[0], {})).toBeNull()

        await auth.revoke(setup.session.token)
        expect(await auth.authenticate(setup.session.token)).toBeNull()
        await client.close()
    })
})
