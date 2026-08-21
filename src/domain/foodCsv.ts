import type { Food } from './nutrition'

export const foodCsvHeaders = [
    'name',
    'brand',
    'calories_per_100g',
    'protein_per_100g',
    'carbs_per_100g',
    'fat_per_100g',
    'fiber_per_100g',
    'sugar_per_100g',
    'saturated_fat_per_100g',
    'sodium_per_100g',
    'potassium_per_100g',
    'serving_name',
    'serving_grams',
    'favorite',
    'nutrition_quality',
] as const

const splitRow = (row: string) => {
    const values: string[] = []
    let value = ''
    let quoted = false
    for (let index = 0; index < row.length; index += 1) {
        const character = row[index]
        if (character === '"' && quoted && row[index + 1] === '"') {
            value += '"'
            index += 1
        } else if (character === '"') {
            quoted = !quoted
        } else if (character === ',' && !quoted) {
            values.push(value.trim())
            value = ''
        } else {
            value += character
        }
    }
    if (quoted) throw new Error('CSV contains an unclosed quoted value.')
    values.push(value.trim())
    return values
}

const numberAt = (record: Record<string, string>, key: string, fallback?: number) => {
    const raw = record[key]
    if (!raw && fallback !== undefined) return fallback
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${key} must be a positive number.`)
    return parsed
}

export function parseFoodCsv(csv: string): Omit<Food, 'id'>[] {
    const rows = csv
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .filter(row => row.trim())
    if (rows.length < 2) throw new Error('CSV must contain a header and at least one food.')
    const headers = splitRow(rows[0]).map(value => value.toLowerCase())
    for (const required of ['name', 'calories_per_100g']) {
        if (!headers.includes(required)) throw new Error(`CSV is missing the ${required} column.`)
    }
    return rows.slice(1).map((row, rowIndex) => {
        const values = splitRow(row)
        const record = Object.fromEntries(
            headers.map((header, index) => [header, values[index] ?? '']),
        )
        if (!record.name) throw new Error(`Row ${rowIndex + 2} is missing a food name.`)
        const servingGrams = numberAt(record, 'serving_grams', 100)
        if (servingGrams <= 0) throw new Error(`Row ${rowIndex + 2} has an invalid serving size.`)
        return {
            name: record.name,
            brand: record.brand || undefined,
            per100g: {
                calories: numberAt(record, 'calories_per_100g'),
                protein: numberAt(record, 'protein_per_100g', 0),
                carbs: numberAt(record, 'carbs_per_100g', 0),
                fat: numberAt(record, 'fat_per_100g', 0),
                fiber: numberAt(record, 'fiber_per_100g', 0),
                sugar: numberAt(record, 'sugar_per_100g', 0),
                saturatedFat: numberAt(record, 'saturated_fat_per_100g', 0),
                sodium: numberAt(record, 'sodium_per_100g', 0),
                potassium: numberAt(record, 'potassium_per_100g', 0),
            },
            servingName: record.serving_name || 'serving',
            servingGrams,
            favorite: ['true', '1', 'yes'].includes((record.favorite ?? '').toLowerCase()),
            nutritionQuality:
                record.nutrition_quality === 'estimated'
                    ? 'estimated'
                    : record.nutrition_quality === 'incomplete'
                      ? 'incomplete'
                      : headers.includes('protein_per_100g') &&
                          headers.includes('carbs_per_100g') &&
                          headers.includes('fat_per_100g')
                        ? 'complete'
                        : 'incomplete',
        }
    })
}

export const foodCsvTemplate = `${foodCsvHeaders.join(',')}\nRolled oats,,389,16.9,66.3,6.9,10.6,0.9,1.2,2,429,bowl,50,true,complete\n`
