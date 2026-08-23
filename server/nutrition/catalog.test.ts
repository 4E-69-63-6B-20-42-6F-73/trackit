import { afterEach, describe, expect, it, vi } from 'vitest'
import { FoodCatalogService } from './catalog.js'

afterEach(() => vi.unstubAllGlobals())

describe('food catalog adapter', () => {
    it('normalizes barcode nutrition and converts sodium to milligrams', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        status: 1,
                        product: {
                            code: '12345678',
                            product_name: 'Catalog food',
                            brands: 'Local brand',
                            serving_size: '40 g',
                            nutriments: {
                                'energy-kcal_100g': 250,
                                proteins_100g: 10,
                                carbohydrates_100g: 30,
                                fat_100g: 8,
                                sodium_100g: 0.4,
                            },
                        },
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } },
                ),
            ),
        )
        const food = await new FoodCatalogService('https://catalog.invalid').barcode('12345678')
        expect(food).toMatchObject({
            name: 'Catalog food',
            barcode: '12345678',
            servingGrams: 40,
            sodiumPer100g: 400,
            nutritionQuality: 'complete',
        })
    })

    it('rejects malformed barcodes before making a request', async () => {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        await expect(
            new FoodCatalogService('https://catalog.invalid').barcode('not-a-barcode'),
        ).rejects.toThrow()
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
