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

describe('MCP food confirmation flow', () => {
    it('commits approved food and meal previews without restating their payloads', async () => {
        const databaseClient = new PGlite()
        await applyTestMigrations(databaseClient)
        const database = drizzle(databaseClient, { schema })
        const access = new McpAccessService(database as never)
        await access.setEnabled(true)
        const issued = await access.issue({
            name: 'Qwen',
            scopes: ['meals', 'meals:write'],
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
        const client = new Client({ name: 'food-confirmation-test', version: '1.0.0' })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

        const previewResponse = await client.callTool({
            name: 'preview_create_food',
            arguments: {
                name: 'Plain Skyr',
                brand: 'Generic',
                caloriesPer100g: 63,
                proteinPer100g: 11,
                carbsPer100g: 4,
                fatPer100g: 0.2,
                servingName: 'pot',
                servingGrams: 150,
                nutritionQuality: 'estimated',
            },
        })
        const preview = resultPayload(previewResponse)
        expect(preview.createArguments).toEqual({
            confirmationToken: expect.stringMatching(/^trk_confirm_/),
            idempotencyKey: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
        })
        expect(preview.nextStep).toContain('createArguments unchanged')

        const createResponse = await client.callTool({
            name: 'create_food',
            arguments: preview.createArguments,
        })
        const created = resultPayload(createResponse)
        expect(created).toMatchObject({
            result: {
                food: {
                    name: 'Plain Skyr',
                    brand: 'Generic',
                    caloriesPer100g: 63,
                    servingGrams: 150,
                    nutritionQuality: 'estimated',
                },
            },
            duplicate: false,
            provenance: 'MCP client Qwen',
        })

        const retryResponse = await client.callTool({
            name: 'create_food',
            arguments: preview.createArguments,
        })
        expect(resultPayload(retryResponse)).toMatchObject({
            duplicate: true,
            result: { food: { name: 'Plain Skyr' } },
        })

        const foodId = created.result.food.id as string
        const mealPreviewResponse = await client.callTool({
            name: 'preview_add_food_to_meal',
            arguments: {
                foodId,
                grams: 150,
                mealType: 'Breakfast',
                eatenAt: '2026-08-30T07:30:00.000Z',
            },
        })
        const mealPreview = resultPayload(mealPreviewResponse)
        expect(mealPreview.commitArguments).toEqual({
            confirmationToken: expect.stringMatching(/^trk_confirm_/),
            idempotencyKey: expect.any(String),
        })
        expect(mealPreview.preview).toMatchObject({
            food: { id: foodId, name: 'Plain Skyr' },
            nutrients: { calories: 94.5, protein: 16.5, carbs: 6 },
        })
        expect(mealPreview.preview.nutrients.fat).toBeCloseTo(0.3)

        const addResponse = await client.callTool({
            name: 'add_food_to_meal',
            arguments: mealPreview.commitArguments,
        })
        expect(resultPayload(addResponse)).toMatchObject({
            result: { meal: { id: expect.any(String) } },
            duplicate: false,
            provenance: 'MCP client Qwen',
        })
        const meals = await data.listMeals()
        expect(meals).toEqual([
            expect.objectContaining({
                name: 'Plain Skyr',
                mealType: 'Breakfast',
                nutrientSnapshot: expect.objectContaining({
                    calories: 94.5,
                    protein: 16.5,
                    carbs: 6,
                }),
            }),
        ])
        expect(meals[0].nutrientSnapshot.fat).toBeCloseTo(0.3)

        await client.close()
        await server.close()
        await databaseClient.close()
    })
})
