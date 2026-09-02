import { describe, expect, it } from 'vitest'
import { inspectFoodCsv, parseFoodCsv } from '@trackit/domain/foodCsv'

describe('food CSV adapter', () => {
    it('imports quoted names, nutrients, serving data, and favorites', () => {
        const [food] = parseFoodCsv(
            'name,brand,calories_per_100g,protein_per_100g,serving_name,serving_grams,favorite\n"Oats, rolled",Local,389,16.9,bowl,50,yes',
        )
        expect(food).toMatchObject({
            name: 'Oats, rolled',
            brand: 'Local',
            servingName: 'bowl',
            servingGrams: 50,
            favorite: true,
            per100g: { calories: 389, protein: 16.9 },
        })
    })

    it('previews valid rows while preserving row-level validation errors', () => {
        const inspection = inspectFoodCsv(
            'name,barcode,calories_per_100g\nValid,12345678,100\nBroken,abc,200',
        )
        expect(inspection.foods).toHaveLength(1)
        expect(inspection.rows).toEqual([
            expect.objectContaining({ row: 2, status: 'ready', name: 'Valid' }),
            expect.objectContaining({ row: 3, status: 'invalid', name: 'Broken' }),
        ])
    })

    it('rejects missing required columns and invalid values', () => {
        expect(() => parseFoodCsv('name\nOats')).toThrow('calories_per_100g')
        expect(() => parseFoodCsv('name,calories_per_100g\nOats,nope')).toThrow('calories_per_100g')
    })
})
