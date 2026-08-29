import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalEvent } from '../domain/types'
import { ServerDataProvider } from '../hooks/useServerData'
import { Today } from './Today'

const todayHealthState = vi.hoisted(() => ({
    summaryMetrics: [] as Array<Record<string, unknown>>,
}))

vi.mock('../hooks/useTodayHealth', () => ({
    useTodayHealth: () => ({
        loading: false,
        unavailable: false,
        summaryMetrics: todayHealthState.summaryMetrics,
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

const preferences = {
    displayName: 'Owner',
    timezone: 'UTC',
    locale: 'en',
    units: 'metric' as const,
}

const renderToday = (events: JournalEvent[] = [], openTrends = vi.fn()) =>
    render(
        <MemoryRouter>
            <MantineProvider>
                <ServerDataProvider initialData={{ preferences }}>
                    <Today events={events} openJournal={vi.fn()} openTrends={openTrends} />
                </ServerDataProvider>
            </MantineProvider>
        </MemoryRouter>,
    )

describe('Today', () => {
    beforeEach(() => {
        todayHealthState.summaryMetrics = []
    })

    it('renders active daily goal progress without the summary panel', async () => {
        const openTrends = vi.fn()
        renderToday([], openTrends)

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

    it('opens the sleep phase diagram from the Sleep duration card', async () => {
        todayHealthState.summaryMetrics = [
            {
                definition: { id: 'sleep', name: 'Sleep duration', category: 'Sleep' },
                observation: {
                    id: 'sleep-observation',
                    definitionId: 'sleep',
                    canonicalValue: 7.5,
                    canonicalUnit: 'hours',
                    originalValue: 7.5,
                    originalUnit: 'hours',
                    observedAt: '2026-08-25T06:00:00.000Z',
                    excluded: false,
                    version: 1,
                },
                value: 7.5,
                baseline: null,
            },
        ]
        const sleepEvent: JournalEvent = {
            id: 'sleep-event',
            definitionId: 'sleep',
            time: '06:00',
            category: 'Sleep',
            title: 'Sleep',
            detail: '7 h 30 min',
            source: 'Health Connect',
            deviceName: 'Pixel Watch',
            observedAt: '2026-08-25T06:00:00.000Z',
            startedAt: '2026-08-24T22:30:00.000Z',
            endedAt: '2026-08-25T06:00:00.000Z',
            detailView: {
                kind: 'sleep',
                stages: [
                    {
                        type: 'deep',
                        start: '2026-08-24T22:30:00.000Z',
                        end: '2026-08-24T23:30:00.000Z',
                    },
                    {
                        type: 'rem',
                        start: '2026-08-25T00:30:00.000Z',
                        end: '2026-08-25T01:15:00.000Z',
                    },
                ],
            },
        }
        renderToday([sleepEvent])

        await userEvent.click(screen.getByRole('button', { name: 'View Sleep duration details' }))

        const dialog = await screen.findByRole('dialog', { name: 'Sleep' })
        expect(within(dialog).getByText('Sleep phases')).toBeInTheDocument()
        expect(within(dialog).getByText('Pixel Watch')).toBeInTheDocument()
        expect(within(dialog).getByText('Deep · 60 min')).toBeInTheDocument()
    })
})
