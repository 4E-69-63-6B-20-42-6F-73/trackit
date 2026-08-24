import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { PostgresDataRepository } from './postgres-repository.js'

describe('nutrition snapshot persistence', () => {
    it('keeps meal history stable and recalculates future recipe servings after edits', async () => {
        const client = new PGlite()
        const migrationDirectory = 'server/db/migrations'
        const migrations = (await readdir(migrationDirectory))
            .filter(filename => filename.endsWith('.sql'))
            .sort()
        for (const filename of migrations) {
            const migration = await readFile(`${migrationDirectory}/${filename}`, 'utf8')
            await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
        }
        const repository = new PostgresDataRepository(drizzle(client, { schema }) as never)
        const food = (await repository.createFood({
            name: 'Snapshot oats',
            caloriesPer100g: 100,
            proteinPer100g: 10,
            carbsPer100g: 20,
            fatPer100g: 5,
            fiberPer100g: 3,
            servingName: 'bowl',
            servingGrams: 100,
            favorite: false,
            nutritionQuality: 'complete',
        }))!
        const favoriteFood = (await repository.createFood({
            name: 'Snapshot oats favorite',
            caloriesPer100g: 100,
            servingName: 'bowl',
            servingGrams: 100,
            favorite: true,
            nutritionQuality: 'complete',
        }))!
        const unusedFood = (await repository.createFood({
            name: 'Unused oats',
            caloriesPer100g: 100,
            servingName: 'bowl',
            servingGrams: 100,
            favorite: false,
            nutritionQuality: 'complete',
        }))!
        await repository.createMeal({
            name: 'Historical oats',
            mealType: 'Breakfast',
            eatenAt: '2026-08-20T08:00:00Z',
            nutrients: { calories: 100, protein: 10 },
            favorite: false,
            nutritionQuality: 'complete',
            foodId: food.id,
        })
        const ranked = (await repository.listFoods()) as {
            id: string
            lastUsedAt: Date | null
        }[]
        expect(ranked.map(record => record.id)).toEqual([favoriteFood.id, food.id, unusedFood.id])
        expect(ranked[1].lastUsedAt).toEqual(new Date('2026-08-20T08:00:00Z'))
        const exact = (await repository.listFoods('Snapshot oats')) as { id: string }[]
        expect(exact.map(record => record.id)).toEqual([food.id, favoriteFood.id])
        const fuzzy = (await repository.listFoods('Snaphot otes')) as { id: string }[]
        expect(fuzzy[0].id).toBe(food.id)
        await repository.updateFood(food.id, {
            caloriesPer100g: 200,
            version: food.version,
        })
        const [historicalMeal] = (await repository.listMeals()) as {
            nutrientSnapshot: Record<string, number>
        }[]
        expect(historicalMeal.nutrientSnapshot.calories).toBe(100)

        const retryId = '10000000-0000-4000-8000-000000000099'
        const retryMeal = {
            id: retryId,
            name: 'Idempotent lunch',
            mealType: 'Lunch' as const,
            eatenAt: '2026-08-20T12:00:00Z',
            nutrients: { calories: 450 },
            favorite: false,
            nutritionQuality: 'complete' as const,
        }
        await repository.createMeal(retryMeal)
        await repository.createMeal(retryMeal)
        expect(
            ((await repository.listMeals()) as { id: string }[]).filter(
                meal => meal.id === retryId,
            ),
        ).toHaveLength(1)

        const recipe = await repository.createRecipe({
            name: 'Porridge',
            servings: 2,
            favorite: false,
            items: [{ foodId: food.id, grams: 100 }],
        })
        const [twoServingRecipe] = await repository.listRecipes()
        expect(twoServingRecipe.nutrientsPerServing.calories).toBe(100)
        await repository.updateRecipe(recipe.id, { servings: 4, version: recipe.version })
        const [fourServingRecipe] = await repository.listRecipes()
        expect(fourServingRecipe.nutrientsPerServing.calories).toBe(50)
        await client.close()
    })
})

describe('goal lifecycle persistence', () => {
    it('only permanently deletes goals after they have been retired', async () => {
        const client = new PGlite()
        for (const filename of (await readdir('server/db/migrations'))
            .filter(name => name.endsWith('.sql'))
            .sort()) {
            const migration = await readFile(`server/db/migrations/${filename}`, 'utf8')
            await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
        }
        const repository = new PostgresDataRepository(drizzle(client, { schema }) as never)
        const active = (await repository.createGoal({
            metricId: 'weight',
            aggregation: 'average',
            comparator: 'lte',
            target: { value: 80 },
            period: { type: 'rolling', days: 7 },
            canonicalUnit: 'kg',
            effectiveFrom: '2026-08-24T00:00:00.000Z',
            effectiveTo: null,
            schedule: {},
        })) as { id: string }

        expect(await repository.removeGoal(active.id)).toBe(false)
        await repository.retireGoal(active.id, '2026-08-24T12:00:00.000Z')
        expect(await repository.removeGoal(active.id)).toBe(true)
        expect(await repository.listGoals()).toEqual([])
        await client.close()
    })
})
