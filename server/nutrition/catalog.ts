import { z } from 'zod'

const barcodeSchema = z.string().regex(/^\d{8,14}$/)

type CatalogProduct = {
    code?: string
    product_name?: string
    brands?: string
    serving_size?: string
    nutriments?: Record<string, number | string | undefined>
}

export type CatalogFood = {
    name: string
    brand?: string
    barcode?: string
    catalogSource: string
    catalogId: string
    servingName: string
    servingGrams: number
    nutritionQuality: 'complete' | 'incomplete'
    caloriesPer100g: number
    proteinPer100g: number
    carbsPer100g: number
    fatPer100g: number
    fiberPer100g: number
    sugarPer100g: number
    saturatedFatPer100g: number
    sodiumPer100g: number
    potassiumPer100g: number
}

const number = (value: number | string | undefined, factor = 1) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed * factor : 0
}

const servingGrams = (value?: string) => {
    const match = value?.match(/([\d.]+)\s*g/i)
    return match ? Math.max(0.01, Number(match[1])) : 100
}

const mapProduct = (product: CatalogProduct): CatalogFood | null => {
    const name = product.product_name?.trim()
    const code = product.code?.trim()
    if (!name || !code) return null
    const nutrients = product.nutriments ?? {}
    const required = ['energy-kcal_100g', 'proteins_100g', 'carbohydrates_100g', 'fat_100g']
    return {
        name,
        brand: product.brands?.split(',')[0]?.trim() || undefined,
        barcode: barcodeSchema.safeParse(code).success ? code : undefined,
        catalogSource: 'open-food-facts',
        catalogId: code,
        servingName: product.serving_size?.trim() || 'serving',
        servingGrams: servingGrams(product.serving_size),
        nutritionQuality: required.every(key => nutrients[key] !== undefined)
            ? 'complete'
            : 'incomplete',
        caloriesPer100g: number(nutrients['energy-kcal_100g']),
        proteinPer100g: number(nutrients.proteins_100g),
        carbsPer100g: number(nutrients.carbohydrates_100g),
        fatPer100g: number(nutrients.fat_100g),
        fiberPer100g: number(nutrients.fiber_100g),
        sugarPer100g: number(nutrients.sugars_100g),
        saturatedFatPer100g: number(nutrients['saturated-fat_100g']),
        sodiumPer100g: number(nutrients.sodium_100g, 1_000),
        potassiumPer100g: number(nutrients.potassium_100g, 1_000),
    }
}

export class FoodCatalogService {
    constructor(private readonly baseUrl: string) {}

    private async json(path: string) {
        const response = await fetch(new URL(path, this.baseUrl), {
            headers: { 'user-agent': 'TrackIt self-hosted food catalog adapter' },
            signal: AbortSignal.timeout(8_000),
        })
        if (!response.ok) throw new Error(`catalog_http_${response.status}`)
        return (await response.json()) as Record<string, unknown>
    }

    async barcode(value: string) {
        const barcode = barcodeSchema.parse(value)
        const body = await this.json(`/api/v2/product/${barcode}.json`)
        if (body.status === 0 || !body.product) return null
        return mapProduct(body.product as CatalogProduct)
    }

    async search(query: string) {
        const body = await this.json(
            `/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12`,
        )
        const products = Array.isArray(body.products) ? body.products : []
        return products.flatMap(product => {
            const mapped = mapProduct(product as CatalogProduct)
            return mapped ? [mapped] : []
        })
    }
}
