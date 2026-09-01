import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalEvent } from '../domain/types'
import { ServerDataProvider } from '../hooks/useServerData'
import { updateMeal } from '../lib/nutritionApi'
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

const event: JournalEvent = {
    id: 'meal-1',
    definitionId: 'meal',
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
    },
}

const preferences = {
    displayName: 'Owner',
    timezone: 'UTC',
    locale: 'en',
    units: 'metric' as const,
}

describe('JournalMealEditModal', () => {
    beforeEach(() => {
        vi.mocked(updateMeal).mockClear()
    })

    it('reuses the food logger and scales the existing nutrition snapshot when the amount changes', async () => {
        const onClose = vi.fn()
        const onSaved = vi.fn()
        render(
            <MantineProvider>
                <ServerDataProvider initialData={{ preferences }}>
                    <JournalMealEditModal event={event} onClose={onClose} onSaved={onSaved} />
                </ServerDataProvider>
            </MantineProvider>,
        )

        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Edit meal')).toBeInTheDocument()
        expect(within(dialog).getByText('Chicken bowl')).toBeInTheDocument()
        expect(within(dialog).getByText(/Current entry/)).toBeInTheDocument()

        const user = userEvent.setup()
        const amount = within(dialog).getByLabelText('Amount')
        await user.clear(amount)
        await user.type(amount, '150')
        await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

        await waitFor(() =>
            expect(updateMeal).toHaveBeenCalledWith(
                'meal-1',
                4,
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
            ),
        )
        expect(onSaved).toHaveBeenCalledTimes(1)
        expect(onClose).toHaveBeenCalledTimes(1)
    })
})
