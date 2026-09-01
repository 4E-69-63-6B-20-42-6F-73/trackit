import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Food } from '../domain/nutrition'
import { listFoodCategories, setFoodCategories } from '../lib/foodCategoryApi'
import { FoodEditModal } from './FoodEditModal'

vi.mock('../lib/foodCategoryApi', () => ({
    listFoodCategories: vi.fn(),
    setFoodCategories: vi.fn(),
}))

const food: Food = {
    id: 'food-1',
    name: 'Plain Skyr',
    brand: 'Generic',
    catalogSource: 'MCP: llama',
    servingName: 'serving',
    servingGrams: 100,
    favorite: false,
    nutritionQuality: 'estimated',
    version: 1,
    per100g: {
        calories: 63,
        protein: 11,
        carbs: 4,
        fat: 0.2,
        sugar: 4,
    },
}

const renderEditor = (onSave = vi.fn().mockResolvedValue(undefined), onDelete = vi.fn()) => {
    const onClose = vi.fn()
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
        <MantineProvider>
            <QueryClientProvider client={queryClient}>
                <FoodEditModal food={food} onClose={onClose} onSave={onSave} onDelete={onDelete} />
            </QueryClientProvider>
        </MantineProvider>,
    )
    return { onClose, onSave, onDelete }
}

describe('FoodEditModal', () => {
    beforeEach(() => {
        vi.mocked(listFoodCategories).mockResolvedValue([])
        vi.mocked(setFoodCategories).mockResolvedValue(undefined)
    })

    it('uses the food form language and keeps a cleared nutrient unknown', async () => {
        const user = userEvent.setup()
        const { onSave } = renderEditor()

        expect(screen.getByRole('dialog', { name: 'Edit food' })).toBeVisible()
        expect(screen.getByText('Basics')).toBeVisible()
        expect(screen.getByText('Serving')).toBeVisible()
        expect(screen.getByText('Nutrition per 100 g')).toBeVisible()
        expect(screen.getByText('Source: MCP: llama')).toBeVisible()
        expect(screen.getByText('Estimated nutrition')).toBeVisible()
        expect(screen.queryByLabelText('Nutrition quality')).not.toBeInTheDocument()

        await user.clear(screen.getByLabelText('Sugar'))
        await user.click(screen.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
        const saved = onSave.mock.calls[0][0]
        expect(saved.per100g).not.toHaveProperty('sugar')
        expect(saved.per100g.fat).toBe(0.2)
        expect(saved.nutritionQuality).toBe('estimated')
    })

    it('keeps secondary nutrients behind a disclosure', async () => {
        const user = userEvent.setup()
        renderEditor()

        const disclosure = screen.getByRole('button', { name: 'More nutrients' })
        expect(disclosure).toHaveAttribute('aria-expanded', 'false')
        await user.click(disclosure)
        expect(screen.getByRole('button', { name: 'Hide more nutrients' })).toHaveAttribute(
            'aria-expanded',
            'true',
        )
        await waitFor(() => expect(screen.getByLabelText('Saturated fat')).toBeVisible())
        expect(screen.getByLabelText('Sodium')).toBeVisible()
        expect(screen.getByLabelText('Potassium')).toBeVisible()
    })

    it('requires a separate confirmation before permanently deleting a food', async () => {
        const user = userEvent.setup()
        const onDelete = vi.fn().mockResolvedValue(undefined)
        const { onClose } = renderEditor(vi.fn().mockResolvedValue(undefined), onDelete)

        const editor = screen.getByRole('dialog', { name: 'Edit food' })
        await user.click(within(editor).getByRole('button', { name: 'Delete food' }))
        const confirmation = await screen.findByRole('dialog', { name: 'Delete this food?' })
        await waitFor(() => expect(confirmation).toBeVisible())
        expect(
            screen.getByText('Logged meals keep their saved nutrition.', { exact: false }),
        ).toBeVisible()
        expect(onDelete).not.toHaveBeenCalled()

        await user.click(within(confirmation).getByRole('button', { name: 'Delete food' }))
        await waitFor(() => expect(onDelete).toHaveBeenCalledOnce())
        expect(onClose).toHaveBeenCalledOnce()
    })
})
