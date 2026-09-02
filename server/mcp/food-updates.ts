import { randomUUID } from 'node:crypto'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { PostgresDataRepository } from '../data/postgres-repository.js'
import type { FoodRecord, FoodRepository } from '../data/types.js'
import type { McpAccessService, McpClient } from './service.js'

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable().optional()
const nullableNutrient = z.number().finite().nonnegative().nullable().optional()

const foodChangeFields = {
    name: z.string().trim().min(1).max(160).optional(),
    brand: nullableText(120),
    barcode: z
        .string()
        .trim()
        .regex(/^[0-9]{8,14}$/)
        .nullable()
        .optional(),
    caloriesPer100g: nullableNutrient,
    proteinPer100g: nullableNutrient,
    carbsPer100g: nullableNutrient,
    fatPer100g: nullableNutrient,
    fiberPer100g: nullableNutrient,
    sugarPer100g: nullableNutrient,
    saturatedFatPer100g: nullableNutrient,
    sodiumPer100g: nullableNutrient,
    potassiumPer100g: nullableNutrient,
    servingName: z.string().trim().min(1).max(60).optional(),
    servingGrams: z.number().finite().positive().optional(),
    favorite: z.boolean().optional(),
    nutritionQuality: z.enum(['complete', 'estimated', 'incomplete']).optional(),
}

const foodChangesSchema = z
    .object(foodChangeFields)
    .refine(changes => Object.values(changes).some(value => value !== undefined), {
        message: 'At least one food field must be changed.',
    })

const updateFoodPayloadSchema = z.object({
    foodId: z.string().uuid(),
    foodVersion: z.number().int().positive(),
    changes: foodChangesSchema,
})

type FoodChanges = z.infer<typeof foodChangesSchema>

const textResult = (data: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
})

const denied = (reason: string) => ({
    isError: true,
    content: [{ type: 'text' as const, text: reason }],
})

const foodSnapshot = (food: FoodRecord) => ({
    id: food.id,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    catalogSource: food.catalogSource,
    catalogId: food.catalogId,
    caloriesPer100g: food.caloriesPer100g,
    proteinPer100g: food.proteinPer100g,
    carbsPer100g: food.carbsPer100g,
    fatPer100g: food.fatPer100g,
    fiberPer100g: food.fiberPer100g,
    sugarPer100g: food.sugarPer100g,
    saturatedFatPer100g: food.saturatedFatPer100g,
    sodiumPer100g: food.sodiumPer100g,
    potassiumPer100g: food.potassiumPer100g,
    servingName: food.servingName,
    servingGrams: food.servingGrams,
    favorite: food.favorite,
    nutritionQuality: food.nutritionQuality,
    version: food.version,
})

const sameValue = (left: unknown, right: unknown) =>
    left === right || (left == null && right == null)

const changedValues = (food: FoodRecord, changes: FoodChanges) =>
    Object.fromEntries(
        Object.entries(changes).filter(
            ([field, value]) =>
                value !== undefined && !sameValue(food[field as keyof FoodRecord], value),
        ),
    ) as FoodChanges

const duplicateFood = (foods: FoodRecord[], id: string, food: FoodRecord, changes: FoodChanges) => {
    if (changes.name === undefined && changes.brand === undefined && changes.barcode === undefined)
        return undefined

    const name = changes.name ?? food.name
    const brand = changes.brand === undefined ? food.brand : changes.brand
    const barcode = changes.barcode === undefined ? food.barcode : changes.barcode
    const normalizedName = name.trim().toLocaleLowerCase()
    const normalizedBrand = String(brand ?? '')
        .trim()
        .toLocaleLowerCase()

    return foods.find(candidate => {
        if (candidate.id === id) return false
        if (barcode && candidate.barcode === barcode) return true
        return (
            candidate.name.trim().toLocaleLowerCase() === normalizedName &&
            String(candidate.brand ?? '')
                .trim()
                .toLocaleLowerCase() === normalizedBrand
        )
    })
}

export function registerFoodUpdateTools(
    server: McpServer,
    client: McpClient,
    data: Pick<FoodRepository, 'listFoods'>,
    access?: McpAccessService,
) {
    const canWrite = () => client.scopes.includes('meals:write') && Boolean(access)

    server.registerTool(
        'preview_update_food',
        {
            description:
                'Preview changes to one saved food. Search for the food first and use the exact returned id. Only include fields that should change; use null to clear a brand, barcode, or nutrient value. Catalog source metadata cannot be edited.',
            inputSchema: {
                foodId: z.string().uuid(),
                changes: foodChangesSchema,
            },
        },
        async ({ foodId, changes }) => {
            if (!canWrite() || !access) return denied('Scope meals:write is required.')
            const foods = await data.listFoods()
            const food = foods.find(candidate => candidate.id === foodId)
            if (!food) return denied('The selected food does not exist.')

            const effectiveChanges = changedValues(food, changes)
            if (!Object.keys(effectiveChanges).length) {
                return denied('The requested values already match the saved food.')
            }

            const duplicate = duplicateFood(foods, foodId, food, effectiveChanges)
            if (duplicate) {
                return denied(
                    `Those changes would duplicate another saved food. Use food id ${duplicate.id} instead.`,
                )
            }

            const payload = {
                foodId,
                foodVersion: food.version,
                changes: effectiveChanges,
            }
            const confirmation = await access.issueConfirmation(
                client,
                'update_food',
                foodId,
                payload,
            )
            const before = foodSnapshot(food)
            const updateArguments = {
                confirmationToken: confirmation.token,
                idempotencyKey: randomUUID(),
            }

            return textResult({
                preview: {
                    before,
                    after: {
                        ...before,
                        ...effectiveChanges,
                        version: food.version + 1,
                    },
                    changedFields: Object.keys(effectiveChanges),
                },
                confirmationToken: confirmation.token,
                expiresAt: confirmation.expiresAt,
                updateArguments,
                nextStep:
                    'Show the before/after preview to the owner. After explicit approval, call update_food exactly once using updateArguments unchanged. Never replace the confirmation token or idempotency key.',
            })
        },
    )

    server.registerTool(
        'update_food',
        {
            description:
                'After explicit owner approval, apply the food changes from preview_update_food using its returned updateArguments unchanged.',
            inputSchema: {
                confirmationToken: z.string().min(1),
                idempotencyKey: z.string().uuid(),
            },
        },
        async ({ confirmationToken, idempotencyKey }) => {
            if (!canWrite() || !access) return denied('Scope meals:write is required.')

            let operation
            try {
                operation = await access.runIdempotent(
                    client,
                    'update_food',
                    idempotencyKey,
                    async transaction => {
                        const confirmation = await access.consumeConfirmationPayload<unknown>(
                            client,
                            confirmationToken,
                            'update_food',
                        )
                        if (!confirmation) throw new Error('confirmation_required')
                        const parsed = updateFoodPayloadSchema.safeParse(confirmation.payload)
                        if (!parsed.success || parsed.data.foodId !== confirmation.targetId) {
                            throw new Error('confirmation_payload_invalid')
                        }

                        const input = parsed.data
                        const transactionalData = new PostgresDataRepository(transaction)
                        const foods = await transactionalData.listFoods()
                        const food = foods.find(candidate => candidate.id === input.foodId)
                        if (!food || food.version !== input.foodVersion) {
                            throw new Error('food_changed')
                        }

                        const duplicate = duplicateFood(foods, food.id, food, input.changes)
                        if (duplicate) throw new Error(`food_exists:${duplicate.id}`)

                        const updated = await transactionalData.updateFood(food.id, {
                            ...input.changes,
                            version: food.version,
                        })
                        if (!updated) throw new Error('food_changed')
                        return { food: updated }
                    },
                )
            } catch (error) {
                if (error instanceof Error && error.message === 'food_changed') {
                    return denied(
                        'The food changed after preview. Search for it and preview the edit again.',
                    )
                }
                if (error instanceof Error && error.message.startsWith('food_exists:')) {
                    return denied(
                        `Those changes would duplicate another saved food. Use food id ${error.message.slice('food_exists:'.length)} instead.`,
                    )
                }
                if (error instanceof Error && error.message === 'idempotency_claim_incomplete') {
                    return denied(
                        'An update_food request with this idempotency key is still in progress. Retry with the same updateArguments.',
                    )
                }
                if (
                    error instanceof Error &&
                    ['confirmation_required', 'confirmation_payload_invalid'].includes(
                        error.message,
                    )
                ) {
                    return denied(
                        'The food edit confirmation is invalid, expired, already used, or from a different client. Call preview_update_food again and reuse its updateArguments unchanged after approval.',
                    )
                }
                return denied(
                    'The food could not be updated. Search for it and preview the edit again.',
                )
            }

            return textResult({ ...operation, provenance: `MCP client ${client.name}` })
        },
    )
}
