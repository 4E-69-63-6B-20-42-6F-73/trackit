import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { PostgresDataRepository } from './postgres-repository.js'

async function migratedDatabase() {
    const client = new PGlite()
    for (const filename of (await readdir('server/db/migrations'))
        .filter(name => name.endsWith('.sql'))
        .sort()) {
        const migration = await readFile(`server/db/migrations/${filename}`, 'utf8')
        await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
    }
    return { client, database: drizzle(client, { schema }) }
}

describe('metric source summaries', () => {
    it('uses an exclusive upper boundary for observations and meals', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values([
            {
                metric: 'steps',
                canonicalValue: 100,
                canonicalUnit: 'count',
                originalValue: 100,
                originalUnit: 'count',
                observedAt: new Date('2026-08-25T23:59:59.999Z'),
            },
            {
                metric: 'steps',
                canonicalValue: 200,
                canonicalUnit: 'count',
                originalValue: 200,
                originalUnit: 'count',
                observedAt: new Date('2026-08-26T00:00:00.000Z'),
            },
        ])
        await database.insert(schema.meals).values([
            {
                name: 'Before midnight',
                mealType: 'Snack',
                eatenAt: new Date('2026-08-25T23:59:59.999Z'),
            },
            {
                name: 'At midnight',
                mealType: 'Snack',
                eatenAt: new Date('2026-08-26T00:00:00.000Z'),
            },
        ])
        const repository = new PostgresDataRepository(database as never)
        const range = {
            from: '2026-08-25T00:00:00.000Z',
            to: '2026-08-26T00:00:00.000Z',
        }
        expect((await repository.listObservations(range)) as unknown[]).toHaveLength(1)
        expect(await repository.listMeals(range)).toHaveLength(1)
        await client.close()
    })

    it('returns distinct provider-aware sources without returning observation history', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values([
            {
                metric: 'steps',
                canonicalValue: 4200,
                canonicalUnit: 'count',
                originalValue: 4200,
                originalUnit: 'count',
                observedAt: new Date('2026-08-24T08:00:00Z'),
                metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
            },
            {
                metric: 'steps',
                canonicalValue: 4300,
                canonicalUnit: 'count',
                originalValue: 4300,
                originalUnit: 'count',
                observedAt: new Date('2026-08-25T08:00:00Z'),
                metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
                version: 1787185408646,
            },
            {
                metric: 'weight',
                canonicalValue: 80,
                canonicalUnit: 'kg',
                originalValue: 80,
                originalUnit: 'kg',
                observedAt: new Date('2026-08-25T09:00:00Z'),
                metadata: { source: 'You' },
            },
        ])

        const repository = new PostgresDataRepository(database as never)
        expect(await repository.listMetricSources()).toEqual([
            { metric: 'steps', provider: 'Garmin', connector: 'Health Connect' },
            { metric: 'weight', provider: 'You', connector: null },
        ])
        await client.close()
    })

    it('serves cross-day BMI and meal-backed calorie balance from one effective series', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values([
            {
                metric: 'height',
                canonicalValue: 180,
                canonicalUnit: 'cm',
                originalValue: 180,
                originalUnit: 'cm',
                observedAt: new Date('2026-08-01T08:00:00Z'),
            },
            {
                metric: 'weight',
                canonicalValue: 81,
                canonicalUnit: 'kg',
                originalValue: 81,
                originalUnit: 'kg',
                observedAt: new Date('2026-08-25T08:00:00Z'),
            },
            {
                metric: 'active_calories',
                canonicalValue: 600,
                canonicalUnit: 'kcal',
                originalValue: 600,
                originalUnit: 'kcal',
                observedAt: new Date('2026-08-25T18:00:00Z'),
            },
        ])
        await database.insert(schema.meals).values({
            name: 'Daily intake',
            mealType: 'Dinner',
            eatenAt: new Date('2026-08-25T19:00:00Z'),
            nutrientSnapshot: { calories: 2200 },
        })
        const repository = new PostgresDataRepository(database as never)
        const records = (await repository.listObservations({
            from: '2026-08-25T00:00:00.000Z',
            to: '2026-08-26T00:00:00.000Z',
            metrics: ['bmi', 'calorie_balance'],
        })) as Array<{ metric: string; canonicalValue: number }>

        expect(records.find(record => record.metric === 'bmi')?.canonicalValue).toBeCloseTo(25)
        expect(records.find(record => record.metric === 'calorie_balance')?.canonicalValue).toBe(
            1600,
        )
        await client.close()
    })

    it('precomputes daily totals from the resolved effective sources', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values([
            {
                metric: 'steps',
                canonicalValue: 7000,
                canonicalUnit: 'count',
                originalValue: 7000,
                originalUnit: 'count',
                observedAt: new Date('2026-08-25T08:00:00Z'),
                metadata: { source: 'Health Connect', dataOrigin: 'Garmin' },
            },
            {
                metric: 'steps',
                canonicalValue: 7000,
                canonicalUnit: 'count',
                originalValue: 7000,
                originalUnit: 'count',
                observedAt: new Date('2026-08-25T08:00:00Z'),
                metadata: { source: 'Health Connect', dataOrigin: 'Samsung Health' },
            },
        ])
        const repository = new PostgresDataRepository(database as never)
        await repository.updatePreferences({
            metricPreferences: {
                steps: {
                    displayUnit: 'count',
                    deduplication: {
                        policy: 'prefer_priority',
                        sourcePriority: ['Health Connect::Garmin'],
                        disabledSources: ['Health Connect::Samsung Health'],
                    },
                },
            },
        })

        expect(await repository.listDailyMetrics({ from: '2026-08-25', to: '2026-08-25' })).toEqual(
            [
                expect.objectContaining({
                    date: '2026-08-25',
                    metric: 'steps',
                    value: 7000,
                    derivationVersion: 2,
                }),
            ],
        )
        await client.close()
    })

    it('materializes an empty day only once', async () => {
        const { client, database } = await migratedDatabase()
        const repository = new PostgresDataRepository(database as never)
        expect(await repository.listDailyMetrics({ from: '2026-08-25', to: '2026-08-25' })).toEqual(
            [],
        )
        const [first] = await database.select().from(schema.dailyProjectionRuns)
        expect(first).toMatchObject({ date: '2026-08-25', status: 'complete' })
        expect(await repository.listDailyMetrics({ from: '2026-08-25', to: '2026-08-25' })).toEqual(
            [],
        )
        const [second] = await database.select().from(schema.dailyProjectionRuns)
        expect(second.completedAt.getTime()).toBe(first.completedAt.getTime())
        await client.close()
    })

    it('queues historical projection backfill while rebuilding the active day', async () => {
        const { client, database } = await migratedDatabase()
        await database.insert(schema.observations).values(
            ['2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25'].map(date => ({
                metric: 'steps',
                canonicalValue: 100,
                canonicalUnit: 'count',
                originalValue: 100,
                originalUnit: 'count',
                observedAt: new Date(`${date}T12:00:00.000Z`),
            })),
        )
        const repository = new PostgresDataRepository(database as never)

        const rows = await repository.listDailyMetrics({
            from: '2026-08-22',
            to: '2026-08-25',
        })

        expect(rows).toEqual([
            expect.objectContaining({ date: '2026-08-25', metric: 'steps', value: 100 }),
        ])
        expect(
            (await database.select().from(schema.projectionDirtyDates))
                .map(item => item.date)
                .sort(),
        ).toEqual(['2026-08-22', '2026-08-23', '2026-08-24'])
        await client.close()
    })
})

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
