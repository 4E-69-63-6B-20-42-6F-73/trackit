import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import * as schema from '../db/schema.js'
import { PostgresDataRepository } from './postgres-repository.js'

describe('meal observation editing', () => {
    it('updates serving and nutrient snapshots through the compound meal observation', async () => {
        const client = new PGlite()
        for (const filename of (await readdir('server/db/migrations'))
            .filter(name => name.endsWith('.sql'))
            .sort()) {
            const migration = await readFile(`server/db/migrations/${filename}`, 'utf8')
            await client.exec(migration.replaceAll('--> statement-breakpoint', ''))
        }
        const repository = new PostgresDataRepository(drizzle(client, { schema }) as never)
        const created = (await repository.createMeal({
            name: 'Oats',
            mealType: 'Breakfast',
            eatenAt: '2026-08-23T08:00:00.000Z',
            nutrients: { calories: 420, protein: 16 },
            favorite: false,
            nutritionQuality: 'estimated',
            serving: { amount: 150, unit: 'g' },
        }))!

        await repository.updateMeal(created.id, {
            name: 'Evening oats',
            mealType: 'Dinner',
            eatenAt: '2026-08-23T19:15:00.000Z',
            nutrients: { calories: 500, protein: 20 },
            nutritionQuality: 'complete',
            serving: { amount: 200, unit: 'g' },
            version: created.version,
        })

        const [updated] = (await repository.listMeals()) as Array<{
            name: string
            mealType: string
            eatenAt: Date
            nutrientSnapshot: Record<string, number>
            serving?: { amount: number; unit: 'g' | 'serving' }
            nutritionQuality: string
        }>
        expect(updated).toMatchObject({
            name: 'Evening oats',
            mealType: 'Dinner',
            nutrientSnapshot: { calories: 500, protein: 20 },
            serving: { amount: 200, unit: 'g' },
            nutritionQuality: 'complete',
        })
        expect(updated.eatenAt).toEqual(new Date('2026-08-23T19:15:00.000Z'))
        await client.close()
    })
})
