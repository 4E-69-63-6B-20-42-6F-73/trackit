import { describe, expect, it } from 'vitest'
import { nutrientsFor, nutrientsPerServing, totalNutrients, type Food } from './nutrition'

const oats: Food = {
    id: 'oats',
    name: 'Oats',
    per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6 },
    servingName: 'bowl',
    servingGrams: 50,
    favorite: true,
}

describe('nutrition calculations', () => {
    it('scales food nutrients by grams without premature rounding', () => {
        expect(nutrientsFor(oats, 50)).toEqual({
            calories: 194.5,
            protein: 8.45,
            carbs: 33.15,
            fat: 3.45,
            fiber: 5.3,
        })
    })

    it('omits unavailable nutrients instead of turning them into NaN', () => {
        const nutrients = nutrientsFor(
            {
                ...oats,
                per100g: {
                    ...oats.per100g,
                    sugar: undefined,
                    saturatedFat: undefined,
                    sodium: 12,
                },
            },
            50,
        )

        expect(nutrients).toEqual({
            calories: 194.5,
            protein: 8.45,
            carbs: 33.15,
            fat: 3.45,
            fiber: 5.3,
            sodium: 6,
        })
        expect(
            Object.values(nutrients).every(
                value => typeof value === 'number' && Number.isFinite(value),
            ),
        ).toBe(true)
    })

    it('totals ingredients and calculates recipe servings', () => {
        const items = [
            { food: oats, grams: 100 },
            { food: oats, grams: 50 },
        ]
        expect(totalNutrients(items).calories).toBeCloseTo(583.5)
        expect(nutrientsPerServing(items, 3).calories).toBeCloseTo(194.5)
        expect(() => nutrientsPerServing(items, 0)).toThrow('Servings must be positive')
    })
})
