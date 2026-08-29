import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Today } from './Today'
import { ServerDataProvider } from '../hooks/useServerData'

vi.mock('../hooks/useTodayHealth', () => ({
    useTodayHealth: () => ({
        loading: false,
        unavailable: false,
        summaryMetrics: [],
        dailyGoals: [
            {
                goal: {
                    id: 'steps-goal',
                    metricId: 'steps',
                    aggregation: 'total',
                    comparator: 'gte',
                    target: { value: 8000 },
                    period: { type: 'day' },
                    canonicalUnit: 'count',
                },
                evaluation: {
                    value: 4321,
                    met: false,
                    progress: 4321 / 8000,
                    observationCount: 1,
                    periodStart: '2026-08-25T00:00:00Z',
                    periodEnd: '2026-08-25T12:00:00Z',
                    difference: 3679,
                },
            },
        ],
        preferences: { displayName: 'Owner', timezone: 'UTC', locale: 'en', units: 'metric' },
    }),
}))

vi.mock('../hooks/useDailyNutrition', () => ({
    useDailyNutrition: () => ({
        nutrients: { calories: 640, protein: 42, carbs: 70, fat: 18, fiber: 9 },
        mealCount: 1,
        loading: false,
        unavailable: false,
        proteinGoal: 120,
        hasProteinGoal: true,
        nutritionQuality: 'complete',
    }),
}))

vi.mock('../lib/journalApi', () => ({
    listJournal: vi.fn().mockResolvedValue([
        {
            id: 'history',
            definitionId: 'steps',
            time: '12:00',
            category: 'Activity',
            title: 'Steps',
            detail: '4,321 steps',
            source: 'Health Connect',
            observedAt: '2026-08-25T12:00:00.000Z',
        },
    ]),
}))

describe('Today', () => {
    it('renders active daily goal progress without the summary panel', async () => {
        const openTrends = vi.fn()
        render(
            <MemoryRouter>
                <MantineProvider>
                    <ServerDataProvider
                        initialData={{
                            preferences: {
                                displayName: 'Owner',
                                timezone: 'UTC',
                                locale: 'en',
                                units: 'metric',
                            },
                        }}
                    >
                        <Today events={[]} openJournal={vi.fn()} openTrends={openTrends} />
                    </ServerDataProvider>
                </MantineProvider>
            </MemoryRouter>,
        )

        expect(
            Number(screen.getByLabelText('Steps progress').getAttribute('aria-valuenow')),
        ).toBeCloseTo(54.0125)
        expect(screen.getByText(/4,?321.*target.*8,?000/i)).toBeInTheDocument()
        expect(screen.getByText('No key observations recorded')).toBeInTheDocument()
        expect(screen.queryByText('Not much was recorded for this day.')).not.toBeInTheDocument()
        expect(screen.getAllByText('Nutrition')).toHaveLength(1)
        expect(screen.getByText('640 kcal')).toBeInTheDocument()
        expect(screen.getByText('42 / 120 g')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Check in now' })).not.toBeInTheDocument()
        expect(screen.queryByText('No sleep trend yet')).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'View all trends' }))
        expect(openTrends).toHaveBeenCalledOnce()
    })
})
