import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { McpAccessService } from './service.js'

describe('MCP payload confirmations', () => {
    it('recovers the exact preview payload and consumes it once', async () => {
        const client = new PGlite()
        await applyTestMigrations(client)
        const database = drizzle(client, { schema })
        const service = new McpAccessService(database as never)
        await service.setEnabled(true)
        const issued = await service.issue({
            name: 'Writer',
            scopes: ['meals:write'],
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })
        const authenticated = (await service.authenticate(issued.token))!
        const payload = {
            name: 'Plain Skyr',
            servingName: 'pot',
            servingGrams: 150,
            nutritionQuality: 'estimated',
        }
        const confirmation = await service.issueConfirmation(
            authenticated,
            'create_food',
            payload.name,
            payload,
        )

        expect(confirmation.token).toMatch(/^trk_confirm_/)
        expect(
            await service.consumeConfirmationPayload(
                authenticated,
                confirmation.token,
                'add_food_to_meal',
            ),
        ).toBeNull()
        expect(
            await service.consumeConfirmationPayload(
                authenticated,
                confirmation.token,
                'create_food',
            ),
        ).toEqual({ targetId: 'Plain Skyr', payload })
        expect(
            await service.consumeConfirmationPayload(
                authenticated,
                confirmation.token,
                'create_food',
            ),
        ).toBeNull()

        const compatible = await service.issueConfirmation(
            authenticated,
            'create_food',
            payload.name,
            payload,
        )
        expect(
            await service.consumeConfirmation(
                authenticated,
                compatible.token,
                'create_food',
                payload.name,
                payload,
            ),
        ).toBe(true)

        await client.close()
    })
})
