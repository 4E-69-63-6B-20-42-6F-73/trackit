import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { McpAccessService } from './service.js'

describe('MCP client access', () => {
    it('keeps multiple assistant credentials independent', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const service = new McpAccessService(database as never)
        await service.setEnabled(true)
        const expiresAt = new Date(Date.now() + 60_000).toISOString()

        const meals = await service.issue({ name: 'Meal coach', scopes: ['meals'], expiresAt })
        const health = await service.issue({
            name: 'Health coach',
            scopes: ['observations'],
            expiresAt,
        })
        const persistent = await service.issue({
            name: 'Long-lived assistant',
            scopes: ['journal'],
        })

        expect(await service.list()).toHaveLength(3)
        expect(await service.authenticate(meals.token)).toMatchObject({
            name: 'Meal coach',
            scopes: ['meals'],
        })
        expect(await service.authenticate(health.token)).toMatchObject({
            name: 'Health coach',
            scopes: ['observations'],
        })
        expect(await service.authenticate(persistent.token)).toMatchObject({
            name: 'Long-lived assistant',
            expiresAt: null,
        })

        await service.revoke(meals.client.id)
        expect(await service.authenticate(meals.token)).toBeNull()
        expect(await service.authenticate(health.token)).toMatchObject({ name: 'Health coach' })
        await client.close()
    })

    it('is disabled by default and immediately rejects a revoked scoped credential', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const service = new McpAccessService(database as never)
        const expiresAt = new Date(Date.now() + 60_000).toISOString()

        expect(await service.list()).toHaveLength(0)
        await service.setEnabled(true)
        expect(await service.list()).toHaveLength(0)
        await service.setEnabled(false)

        const issued = await service.issue({
            name: 'Assistant',
            scopes: ['meals'],
            expiresAt,
        })
        expect(await service.authenticate(issued.token)).toBeNull()

        await service.setEnabled(true)
        const authenticated = await service.authenticate(issued.token)
        expect(authenticated).toMatchObject({ name: 'Assistant', scopes: ['meals'] })
        await service.auditRequest(authenticated!, 'list_meals')
        expect(await service.listAccessEvents()).toEqual([
            expect.objectContaining({
                actor: `mcp:${authenticated!.id}`,
                action: 'mcp.request',
                targetId: 'list_meals',
            }),
        ])

        await service.revoke(issued.client.id)
        expect(await service.authenticate(issued.token)).toBeNull()
        await client.close()
    })

    it('deduplicates actions and binds one-time confirmations to client, action, and target', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const service = new McpAccessService(database as never)
        await service.setEnabled(true)
        const issued = await service.issue({
            name: 'Writer',
            scopes: ['checkins:write', 'journal:delete'],
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
        const authenticated = (await service.authenticate(issued.token))!
        let calls = 0
        const first = await service.runIdempotent(
            authenticated,
            'checkin',
            'same-key',
            async () => ({
                sequence: ++calls,
            }),
        )
        const retry = await service.runIdempotent(
            authenticated,
            'checkin',
            'same-key',
            async () => ({
                sequence: ++calls,
            }),
        )
        expect(first).toEqual({ result: { sequence: 1 }, duplicate: false })
        expect(retry).toEqual({ result: { sequence: 1 }, duplicate: true })
        expect(calls).toBe(1)

        let releaseOperation!: () => void
        const operationStarted = new Promise<void>(resolve => {
            releaseOperation = resolve
        })
        let concurrentCalls = 0
        const concurrentOperation = async () => {
            concurrentCalls += 1
            if (concurrentCalls === 1) {
                await new Promise<void>(resolve => setTimeout(resolve, 20))
                releaseOperation()
            }
            return { sequence: concurrentCalls }
        }
        const concurrent = await Promise.all([
            service.runIdempotent(authenticated, 'checkin', 'concurrent-key', concurrentOperation),
            service.runIdempotent(authenticated, 'checkin', 'concurrent-key', concurrentOperation),
            operationStarted,
        ])
        expect(concurrentCalls).toBe(1)
        expect(concurrent.slice(0, 2)).toEqual(
            expect.arrayContaining([
                { result: { sequence: 1 }, duplicate: false },
                { result: { sequence: 1 }, duplicate: true },
            ]),
        )

        const confirmation = await service.issueConfirmation(
            authenticated,
            'delete_journal',
            'record-one',
        )
        expect(
            await service.consumeConfirmation(
                authenticated,
                confirmation.token,
                'delete_journal',
                'record-two',
            ),
        ).toBe(false)
        expect(
            await service.consumeConfirmation(
                authenticated,
                confirmation.token,
                'delete_journal',
                'record-one',
            ),
        ).toBe(true)
        expect(
            await service.consumeConfirmation(
                authenticated,
                confirmation.token,
                'delete_journal',
                'record-one',
            ),
        ).toBe(false)

        const revokedConfirmation = await service.issueConfirmation(
            authenticated,
            'delete_journal',
            'record-after-revocation',
        )
        await service.revoke(authenticated.id)
        expect(
            await service.consumeConfirmation(
                authenticated,
                revokedConfirmation.token,
                'delete_journal',
                'record-after-revocation',
            ),
        ).toBe(false)
        await client.close()
    })
})
