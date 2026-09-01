import { MantineProvider } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalEvent } from '@trackit/domain/types'
import { ServerDataProvider } from '../hooks/useServerData'
import { listRecipes, updateMeal } from '../lib/nutritionApi'
import { createTestQueryClient } from '../test/queryClient'
import { JournalMealEditModal } from './JournalMealEditModal'

vi.mock('../lib/nutritionApi', () => ({
    createFood: vi.fn(),
    listRecipes: vi.fn().mockResolvedValue([]),
    logMeal: vi.fn(),
    lookupCatalogBarcode: vi.fn(),
    searchFoodCatalog: vi.fn(),
    searchFoods: vi.fn().mockResolvedValue([]),
    updateFood: vi.fn(),
    updateMeal: vi.fn().mockResolvedValue(undefined),
}))

const foodId = '11111111-1111-4111-8111-111111111111'
const event: JournalEvent = {
    id: 'meal-1',
    definitionId: 'calories',
    entityType: 'meal',
    entityId: 'meal-1',
    editable: true,
    time: '12:30',
    category: 'Meals',
    title: 'Chicken bowl',
    detail: '75 g · 300 kcal',
    source: 'You',
    observedAt: '2026-08-23T12:30:00.000Z',
    version: 4,
    detailView: {
        kind: 'meal',
        mealType: 'Lunch',
        serving: { amount: 75, unit: 'g' },
        nutrients: {
            calories: 300,
            protein: 24,
            carbs: 30,
            fat: 9,
            fiber: 4,
        },
        nutritionQuality: 'complete',
        sourceItem: { kind: 'food', id: foodId },
    },
}

const preferences = {
    displayName: 'Owner',
    timezone: 'UTC',
    locale: 'en',
    units: 'metric' as const,
}

const renderEditor = (onClose = vi.fn(), onSaved = vi.fn()) => {
    const queryClient = createTestQueryClient()
    render(
        <MantineProvider>
            <QueryClientProvider client={queryClient}>
                <ServerDataProvider initialData={{ preferences }}>
                    <JournalMealEditModal event={event} onClose={onClose} onSaved={onSaved} />
                </ServerDataProvider>
            </QueryClientProvider>
        </MantineProvider>,
    )
    return { onClose, onSaved }
}

describe('JournalMealEditModal', () => {
    beforeEach(() => {
        vi.mocked(updateMeal).mockClear()
        vi.mocked(listRecipes).mockResolvedValue([])
    })

    it('reuses the food logger and scales the existing nutrition snapshot when the amount changes', async () => {
        const { onClose, onSaved } = renderEditor()

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Edit meal')).toBeInTheDocument()
        expect(within(dialog).getByText('Chicken bowl')).toBeInTheDocument()
        expect(within(dialog).getByText(/Current entry/)).toBeInTheDocument()

        const user = userEvent.setup()
        const amount = within(dialog).getByLabelText('Amount')
        await user.clear(amount)
        await user.type(amount, '150')
        await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(updateMeal).toHaveBeenCalledTimes(1))
        const [, , changes] = vi.mocked(updateMeal).mock.calls[0]!
        expect(changes).toEqual(
            expect.objectContaining({
                name: 'Chicken bowl',
                mealType: 'Lunch',
                serving: { amount: 150, unit: 'g' },
                nutrients: expect.objectContaining({
                    calories: 600,
                    protein: 48,
                    carbs: 60,
                    fat: 18,
                    fiber: 8,
                }),
            }),
        )
        expect(changes.foodId).toBeUndefined()
        expect(changes.recipeId).toBeUndefined()
        expect(onSaved).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('switches meal provenance when a recipe replaces the saved food', async () => {
        const recipeId = '22222222-2222-4222-8222-222222222222'
        vi.mocked(listRecipes).mockResolvedValue([
            {
                id: recipeId,
                name: 'Granola bowl',
                servings: 2,
                favorite: false,
                version: 1,
                nutrientsPerServing: {
                    calories: 450,
                    protein: 18,
                    carbs: 55,
                    fat: 16,
                    fiber: 7,
                    sugar: 12,
                    saturatedFat: 3,
                    sodium: 200,
                    potassium: 400,
                },
                nutritionQuality: 'complete',
                items: [],
            },
        ])
        renderEditor()

        const dialog = await screen.findByRole('dialog')
        const user = userEvent.setup()
        const search = within(dialog).getByLabelText('Search foods and recipes')
        await user.clear(search)
        await user.type(search, 'Granola')
        await user.click(await within(dialog).findByRole('button', { name: 'Choose Granola bowl' }))
        await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(updateMeal).toHaveBeenCalledTimes(1))
        expect(vi.mocked(updateMeal).mock.calls[0]?.[2]).toEqual(
            expect.objectContaining({
                name: 'Granola bowl',
                serving: { amount: 1, unit: 'serving' },
                foodId: null,
                recipeId,
                nutrients: expect.objectContaining({ calories: 450, protein: 18 }),
            }),
        )
    })
})
