import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerDataProvider } from '../hooks/useServerData'
import { getJournalEntry } from '../lib/journalApi'
import { JournalEventList } from './JournalEventList'

vi.mock('../lib/journalApi', () => ({
    getJournalEntry: vi.fn(),
}))

const sleepEvent = {
    id: 'sleep-entry',
    definitionId: 'sleep',
    time: '07:10',
    category: 'Sleep' as const,
    title: 'Sleep session',
    detail: 'Sleep 7.5 hours · Deep 1.2 hours · Rem 1.6 hours',
    source: 'Health Connect · Garmin',
    observedAt: '2026-08-29T07:10:00.000Z',
    startedAt: '2026-08-28T23:40:00.000Z',
    endedAt: '2026-08-29T07:10:00.000Z',
    version: 1,
    detailView: {
        kind: 'sleep' as const,
        stages: [
            {
                type: 'light' as const,
                start: '2026-08-28T23:40:00.000Z',
                end: '2026-08-29T01:00:00.000Z',
            },
            {
                type: 'deep' as const,
                start: '2026-08-29T01:00:00.000Z',
                end: '2026-08-29T01:40:00.000Z',
            },
            {
                type: 'rem' as const,
                start: '2026-08-29T01:40:00.000Z',
                end: '2026-08-29T02:10:00.000Z',
            },
        ],
    },
}

const mealEvent = {
    id: 'meal-entry',
    definitionId: 'calories',
    time: '19:15',
    category: 'Meals' as const,
    title: 'Plain Skyr',
    detail: '150 g · 95 kcal',
    source: 'You',
    observedAt: '2026-08-29T19:15:00.000Z',
    version: 1,
    detailView: {
        kind: 'meal' as const,
        mealType: 'Dinner' as const,
        serving: { amount: 150, unit: 'g' as const },
        nutrients: {
            calories: 95,
            protein: 16.5,
            carbs: 6,
            fat: 0.3,
            fiber: 0,
            sugar: 6,
            saturatedFat: 0.1,
            sodium: 120,
            potassium: 240,
        },
        nutritionQuality: 'estimated' as const,
    },
}

const preferences = {
    displayName: 'Owner',
    timezone: 'UTC',
    locale: 'en',
    units: 'metric' as const,
}

const renderEvents = (events: Array<typeof sleepEvent | typeof mealEvent>) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <MemoryRouter>
            <MantineProvider>
                <QueryClientProvider client={queryClient}>
                    <ServerDataProvider initialData={{ preferences }}>
                        <JournalEventList events={events} roomy />
                    </ServerDataProvider>
                </QueryClientProvider>
            </MantineProvider>
        </MemoryRouter>,
    )
}

describe('Journal entry details', () => {
    beforeEach(() => {
        vi.mocked(getJournalEntry).mockReset()
    })

    it('opens a detailed sleep view directly', async () => {
        vi.mocked(getJournalEntry).mockResolvedValue(sleepEvent)
        renderEvents([sleepEvent])

        await userEvent.click(screen.getByRole('button', { name: /sleep session/i }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Sleep phases')).toBeInTheDocument()
        expect(within(dialog).getByText(/Deep · 40 min/)).toBeInTheDocument()
        expect(within(dialog).getByText('Health Connect · Garmin')).toBeInTheDocument()
        expect(
            within(dialog).queryByRole('button', { name: 'View detailed sleep' }),
        ).not.toBeInTheDocument()
        expect(
            within(dialog).queryByRole('button', { name: 'Back to entry' }),
        ).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'View trend' })).not.toBeInTheDocument()
    })

    it('shows meal size and energy in the Journal row and full nutrition in details', async () => {
        vi.mocked(getJournalEntry).mockResolvedValue(mealEvent)
        renderEvents([mealEvent])

        expect(screen.getByText('150 g · 95 kcal')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: /plain skyr/i }))
        const dialog = await screen.findByRole('dialog')
        expect(within(dialog).getByText('Dinner')).toBeInTheDocument()
        expect(within(dialog).getByText('150 g')).toBeInTheDocument()
        expect(within(dialog).getByText('95 kcal')).toBeInTheDocument()
        expect(within(dialog).getByText('16.5 g')).toBeInTheDocument()
        expect(within(dialog).getByText('120 mg')).toBeInTheDocument()
        expect(within(dialog).getByText('240 mg')).toBeInTheDocument()
        expect(within(dialog).getByText('Estimated nutrition')).toBeInTheDocument()
        expect(within(dialog).getByText('You')).toBeInTheDocument()
    })
})
