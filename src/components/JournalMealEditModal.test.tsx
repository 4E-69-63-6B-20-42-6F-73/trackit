import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalEvent } from '../domain/types'
import { ServerDataProvider } from '../hooks/useServerData'
import { updateMeal } from '../lib/nutritionApi'
import { JournalMealEditModal } from './JournalMealEditModal'

vi.mock('../lib/nutritionApi', () => ({
    updateMeal: vi.fn(),
}))

const meal: JournalEvent = {
    id: '10000000-0000-4000-8000-000000000001',
    definitionId: 'calories',
    time: '08:00',
    category: 'Meals',
    title: 'Oats',
    detail: '150 g · 420 kcal',
    source: 'You',
    observedAt: '2026-08-23T08:00:00.000Z',
    version: 3,
    detailView: {
        kind: 'meal',
        mealType: 'Breakfast',
        serving: { amount: 150, unit: 'g' },
        nutrients: {
            calories: 420,
            protein: 16,
            carbs: 64,
            fat: 10,
            cholesterol: 30,
        },
        nutritionQuality: 'estimated',
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
        vi.mocked(updateMeal).mockReset()
        vi.mocked(updateMeal).mockResolvedValue({} as never)
    })

    it('writes edited meal fields through the meal observation command', async () => {
        const user = userEvent.setup()
        const onSaved = vi.fn()
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
        render(
            <MantineProvider>
                <QueryClientProvider client={queryClient}>
                    <ServerDataProvider initialData={{ preferences }}>
                        <JournalMealEditModal event={meal} onClose={vi.fn()} onSaved={onSaved} />
                    </ServerDataProvider>
                </QueryClientProvider>
            </MantineProvider>,
        )

        expect(screen.getByRole('dialog', { name: 'Edit meal' })).toBeVisible()
        expect(screen.getByLabelText('Amount')).toHaveValue('150')

        await user.clear(screen.getByLabelText('Name'))
        await user.type(screen.getByLabelText('Name'), 'Evening oats')
        await user.click(screen.getByText('Dinner'))
        fireEvent.change(screen.getByLabelText('Date and time'), {
            target: { value: '2026-08-23T19:15' },
        })
        await user.clear(screen.getByLabelText('Amount'))
        await user.type(screen.getByLabelText('Amount'), '200')
        await user.clear(screen.getByLabelText('Energy'))
        await user.type(screen.getByLabelText('Energy'), '500')
        await user.clear(screen.getByLabelText('Protein'))
        await user.type(screen.getByLabelText('Protein'), '20')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))

        await waitFor(() => expect(updateMeal).toHaveBeenCalledOnce())
        expect(updateMeal).toHaveBeenCalledWith(
            meal.id,
            3,
            expect.objectContaining({
                name: 'Evening oats',
                mealType: 'Dinner',
                eatenAt: '2026-08-23T19:15:00.000Z',
                serving: { amount: 200, unit: 'g' },
                nutritionQuality: 'estimated',
                nutrients: expect.objectContaining({
                    calories: 500,
                    protein: 20,
                    cholesterol: 30,
                }),
            }),
        )
        expect(onSaved).toHaveBeenCalledOnce()
    })
})
