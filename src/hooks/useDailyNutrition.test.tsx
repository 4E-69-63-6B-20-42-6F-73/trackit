import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listMeals } from '../lib/nutritionApi'
import { createTestQueryClient } from '../test/queryClient'
import { ServerDataProvider } from './useServerData'
import { useDailyNutrition } from './useDailyNutrition'

vi.mock('../lib/nutritionApi', () => ({ listMeals: vi.fn() }))

const createWrapper = () => {
    const queryClient = createTestQueryClient()
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <ServerDataProvider
                initialData={{
                    preferences: {
                        displayName: 'Alex',
                        timezone: 'Europe/Amsterdam',
                        locale: 'en-US',
                    },
                    goals: [
                        {
                            id: 'protein-goal',
                            definitionId: 'protein',
                            aggregation: 'total',
                            comparator: 'gte',
                            target: { value: 120 },
                            period: { type: 'day' },
                            canonicalUnit: 'g',
                            effectiveFrom: '2026-08-01T00:00:00.000Z',
                            effectiveTo: null,
                            schedule: { weekdays: [2] },
                        },
                    ],
                }}
            >
                {children}
            </ServerDataProvider>
        </QueryClientProvider>
    )
}

describe('useDailyNutrition', () => {
    beforeEach(() => {
        vi.mocked(listMeals).mockResolvedValue([
            {
                id: 'meal-1',
                name: 'Lunch',
                mealType: 'Lunch',
                eatenAt: '2026-08-25T11:30:00.000Z',
                nutrientSnapshot: { calories: 640, protein: 42, carbs: 70, fat: 18, fiber: 9 },
                favorite: false,
                version: 1,
                nutritionQuality: 'complete',
            },
        ])
    })

    it('uses the configured timezone for the meal range and daily goal schedule', async () => {
        const selectedDate = new Date('2026-08-24T22:00:00.000Z')
        const { result } = renderHook(() => useDailyNutrition(selectedDate), {
            wrapper: createWrapper(),
        })

        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(listMeals).toHaveBeenCalledWith(
            {
                from: '2026-08-24T22:00:00.000Z',
                to: '2026-08-25T22:00:00.000Z',
            },
            expect.any(AbortSignal),
        )
        expect(result.current.mealCount).toBe(1)
        expect(result.current.nutrients.protein).toBe(42)
        expect(result.current.proteinGoal).toBe(120)
    })
})
