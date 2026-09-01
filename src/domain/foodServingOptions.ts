import type { FoodServingOption } from './nutrition'

export type ServingOptionDraft = {
    id: string
    label: string
    grams: number | string
}

export const servingOptionDrafts = (options: FoodServingOption[] = []): ServingOptionDraft[] =>
    options.map((option, index) => ({
        id: `${index}-${option.label}-${option.grams}`,
        label: option.label,
        grams: option.grams,
    }))

export const servingOptionsFromDrafts = (options: ServingOptionDraft[]): FoodServingOption[] =>
    options
        .map(option => ({ label: option.label.trim(), grams: Number(option.grams) }))
        .filter(option => option.label && Number.isFinite(option.grams) && option.grams > 0)
