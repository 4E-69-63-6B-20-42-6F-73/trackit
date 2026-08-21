import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { AuthService } from './service.js'

describe('owner authentication', () => {
    it('hashes credentials and issues revocable opaque sessions', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
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

        const [firstAttempt, secondAttempt] = await Promise.all([
            auth.authenticationOptions('browser-one'),
            auth.authenticationOptions('browser-one'),
        ])
        expect(firstAttempt.attemptId).not.toBe(secondAttempt.attemptId)
        const consumeChallenge = (
            auth as unknown as {
                consumeChallenge: (
                    kind: string,
                    attemptId: string,
                    binding: string,
                ) => Promise<string>
            }
        ).consumeChallenge.bind(auth)
        await expect(
            consumeChallenge('authentication', firstAttempt.attemptId, 'other-browser'),
        ).rejects.toThrow('challenge_expired')
        await expect(
            consumeChallenge('authentication', firstAttempt.attemptId, 'browser-one'),
        ).resolves.toBe(firstAttempt.options.challenge)
        await expect(
            consumeChallenge('authentication', firstAttempt.attemptId, 'browser-one'),
        ).rejects.toThrow('challenge_expired')
        await expect(
            consumeChallenge('authentication', secondAttempt.attemptId, 'browser-one'),
        ).resolves.toBe(secondAttempt.options.challenge)

        const recovered = await auth.recover(setup.recoveryCodes[0], {})
        expect(recovered).not.toBeNull()
        expect(await auth.recover(setup.recoveryCodes[0], {})).toBeNull()

        const concurrentCode = setup.recoveryCodes[1]
        const concurrentRecovery = await Promise.all([
            auth.recover(concurrentCode, {}),
            auth.recover(concurrentCode, {}),
        ])
        expect(concurrentRecovery.filter(Boolean)).toHaveLength(1)

        await auth.revoke(setup.session.token)
        expect(await auth.authenticate(setup.session.token)).toBeNull()
        await client.close()
    })
})
