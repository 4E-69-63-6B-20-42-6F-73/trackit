import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { applyTestMigrations } from '../db/test-migrations.js'
import { PostgresDataRepository } from '../data/postgres-repository.js'
import { createTrackItMcpServer } from './server.js'
import { McpAccessService } from './service.js'

const resultPayload = (response: unknown) =>
    JSON.parse((response as { content: { text: string }[] }).content[0].text)

const createHarness = async () => {
    const databaseClient = new PGlite()
    await applyTestMigrations(databaseClient)
    const database = drizzle(databaseClient, { schema })
    const access = new McpAccessService(database as never)
    await access.setEnabled(true)
    const issued = await access.issue({
        name: 'Nutrition editor',
        scopes: ['meals:write'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    const grant = (await access.authenticate(issued.token))!
    const data = new PostgresDataRepository(database as never)
    const server = createTrackItMcpServer(
        grant,
        data,
        { list: async () => [] } as never,
        access,
    )
    const client = new Client({ name: 'food-update-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    return { databaseClient, data, server, client }
}

describe('MCP food editing', () => {
    it('previews and idempotently applies approved changes to an existing food', async () => {
        const { databaseClient, data, server, client } = await createHarness()
        const food = (await data.createFood({
            name: 'Plain Skyr',
            brand: 'Original Dairy',
            catalogSource: 'Imported catalog',
            catalogId: 'skyr-123',
            caloriesPer100g: 63,
            proteinPer100g: 11,
            carbsPer100g: 4,
            fatPer100g: 0.2,
            fiberPer100g: 0,
            servingName: 'pot',
            servingGrams: 150,
            favorite: false,
            nutritionQuality: 'complete',
        })) as { id: string; version: number }

        const previewResponse = await client.callTool({
            name: 'preview_update_food',
            arguments: {
                foodId: food.id,
                changes: {
                    brand: 'Updated Dairy',
                    caloriesPer100g: 65,
                    proteinPer100g: 12,
                    fiberPer100g: null,
                    servingGrams: 170,
                    favorite: true,
                    nutritionQuality: 'estimated',
                },
            },
        })
        const preview = resultPayload(previewResponse)

        expect(preview.preview).toMatchObject({
            before: {
                id: food.id,
                brand: 'Original Dairy',
                caloriesPer100g: 63,
                fiberPer100g: 0,
                servingGrams: 150,
                favorite: false,
                catalogSource: 'Imported catalog',
                catalogId: 'skyr-123',
                version: food.version,
            },
            after: {
                id: food.id,
                brand: 'Updated Dairy',
                caloriesPer100g: 65,
                proteinPer100g: 12,
                fiberPer100g: null,
                servingGrams: 170,
                favorite: true,
                nutritionQuality: 'estimated',
                catalogSource: 'Imported catalog',
                catalogId: 'skyr-123',
                version: food.version + 1,
            },
        })
        expect(preview.updateArguments).toEqual({
            confirmationToken: expect.stringMatching(/^trk_confirm_/),
            idempotencyKey: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
        })
        expect(preview.nextStep).toContain('updateArguments unchanged')

        const updateResponse = await client.callTool({
            name: 'update_food',
            arguments: preview.updateArguments,
        })
        const updated = resultPayload(updateResponse)
        expect(updated).toMatchObject({
            duplicate: false,
            result: {
                food: {
                    id: food.id,
                    brand: 'Updated Dairy',
                    caloriesPer100g: 65,
                    proteinPer100g: 12,
                    fiberPer100g: null,
                    servingGrams: 170,
                    favorite: true,
                    nutritionQuality: 'estimated',
                    catalogSource: 'Imported catalog',
                    catalogId: 'skyr-123',
                    version: food.version + 1,
                },
            },
            provenance: 'MCP client Nutrition editor',
        })

        const retryResponse = await client.callTool({
            name: 'update_food',
            arguments: preview.updateArguments,
        })
        expect(resultPayload(retryResponse)).toMatchObject({
            duplicate: true,
            result: { food: { id: food.id, version: food.version + 1 } },
        })

        const saved = (await data.listFoods()).find(
            candidate => (candidate as { id: string }).id === food.id,
        ) as Record<string, unknown>
        expect(saved).toMatchObject({
            brand: 'Updated Dairy',
            caloriesPer100g: 65,
            proteinPer100g: 12,
            fiberPer100g: null,
            servingGrams: 170,
            favorite: true,
            catalogSource: 'Imported catalog',
            catalogId: 'skyr-123',
            version: food.version + 1,
        })

        await client.close()
        await server.close()
        await databaseClient.close()
    })

    it('refuses to commit a preview after the food version changes', async () => {
        const { databaseClient, data, server, client } = await createHarness()
        const food = (await data.createFood({
            name: 'Greek yogurt',
            caloriesPer100g: 90,
            proteinPer100g: 9,
            servingName: 'bowl',
            servingGrams: 200,
            favorite: false,
            nutritionQuality: 'complete',
        })) as { id: string; version: number }

        const preview = resultPayload(
            await client.callTool({
                name: 'preview_update_food',
                arguments: {
                    foodId: food.id,
                    changes: { caloriesPer100g: 95 },
                },
            }),
        )

        await data.updateFood(food.id, {
            proteinPer100g: 10,
            version: food.version,
        })

        const updateResponse = await client.callTool({
            name: 'update_food',
            arguments: preview.updateArguments,
        })
        expect(updateResponse.isError).toBe(true)
        expect((updateResponse.content[0] as { text: string }).text).toContain(
            'changed after preview',
        )

        const [saved] = (await data.listFoods('Greek yogurt')) as Array<{
            caloriesPer100g: number
            proteinPer100g: number
        }>
        expect(saved).toMatchObject({ caloriesPer100g: 90, proteinPer100g: 10 })

        await client.close()
        await server.close()
        await databaseClient.close()
    })
})
