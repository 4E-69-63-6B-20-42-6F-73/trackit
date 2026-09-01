import { MantineProvider } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JournalEvent } from '@trackit/domain/types'
import { ServerDataProvider } from '../hooks/useServerData'
import { getJournalEntry, listJournal } from '../lib/journalApi'
import { createTestQueryClient } from '../test/queryClient'
import { Journal } from './Journal'

vi.mock('../lib/journalApi', () => ({
    getJournalEntry: vi.fn(),
    listJournal: vi.fn(),
}))

vi.mock('../components/JournalMealEditModal', () => ({
    JournalMealEditModal: ({ event }: { event: JournalEvent | null }) =>
        event ? <div data-testid="journal-meal-editor">{event.title}</div> : null,
}))

const records: JournalEvent[] = [
    {
        id: '1',
        definitionId: 'note',
        entityType: 'observation',
        entityId: '1',
        editable: true,
        time: '08:00',
        category: 'Check-ins',
        title: 'Breakfast',
        detail: 'Oats',
        source: 'You',
        observedAt: '2026-08-23T08:00:00.000Z',
    },
    {
        id: '2',
        definitionId: 'walk',
        entityType: 'observation',
        entityId: '2',
        editable: false,
        time: '09:00',
        category: 'Activity',
        title: 'Walk',
        detail: '20 minutes',
        source: 'Health Connect',
        observedAt: '2026-08-22T09:00:00.000Z',
    },
    {
        id: '3',
        definitionId: 'walk',
        entityType: 'observation',
        entityId: '3',
        editable: false,
        time: '10:00',
        category: 'Activity',
        title: 'Earlier walk',
        detail: '15 minutes',
        source: 'Health Connect',
        observedAt: '2026-08-16T10:00:00.000Z',
    },
]

const sleepRecord: JournalEvent = {
    id: 'sleep-1',
    definitionId: 'sleep',
    entityType: 'observation',
    entityId: 'sleep-1',
    editable: false,
    time: '07:30',
    category: 'Sleep',
    title: 'Sleep',
    detail: '7 h 30 min',
    source: 'Health Connect',
    deviceName: 'Pixel Watch',
    observedAt: '2026-08-23T07:30:00.000Z',
    startedAt: '2026-08-22T22:00:00.000Z',
    endedAt: '2026-08-23T05:30:00.000Z',
    detailView: {
        kind: 'sleep',
        stages: [
            {
                type: 'deep',
                start: '2026-08-22T22:00:00.000Z',
                end: '2026-08-22T23:00:00.000Z',
            },
            {
                type: 'rem',
                start: '2026-08-22T23:00:00.000Z',
                end: '2026-08-23T00:00:00.000Z',
            },
        ],
    },
}

const preferences = {
    displayName: 'Owner',
    timezone: 'UTC',
    locale: 'en',
    units: 'metric' as const,
}

const renderJournal = (
    entry = '/',
    update = vi.fn().mockResolvedValue(true),
    events: JournalEvent[] = records,
    details: Record<string, JournalEvent> = {},
) => {
    vi.mocked(listJournal).mockResolvedValue(events)
    vi.mocked(getJournalEntry).mockImplementation(async id => {
        const event = details[id] ?? events.find(record => record.id === id)
        if (!event) throw new Error('not found')
        return event
    })
    const queryClient = createTestQueryClient()
    return render(
        <MemoryRouter initialEntries={[entry]}>
            <MantineProvider>
                <QueryClientProvider client={queryClient}>
                    <ServerDataProvider initialData={{ preferences }}>
                        <Journal remove={vi.fn()} update={update} />
                    </ServerDataProvider>
                </QueryClientProvider>
            </MantineProvider>
        </MemoryRouter>,
    )
}

describe('Journal', () => {
    beforeEach(() => {
        vi.mocked(listJournal).mockReset()
        vi.mocked(getJournalEntry).mockReset()
    })

    it('owns a single filtered request and exposes owner actions only when available', async () => {
        const update = vi.fn().mockResolvedValue(true)
        renderJournal('/?from=2026-08-16&to=2026-08-23', update)

        await waitFor(() => expect(listJournal).toHaveBeenCalledTimes(1))
        expect(listJournal).toHaveBeenCalledWith(
            expect.objectContaining({
                from: '2026-08-16T00:00:00.000Z',
                to: '2026-08-24T00:00:00.000Z',
                limit: 100,
            }),
            expect.any(AbortSignal),
        )

        const user = userEvent.setup()
        const search = await screen.findByRole('textbox', { name: 'Search journal' })
        await screen.findByText('Breakfast')

        expect(screen.getByLabelText('Actions for Breakfast')).toBeInTheDocument()
        expect(screen.queryByLabelText('Actions for Walk')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Actions for Earlier walk')).not.toBeInTheDocument()

        await user.type(search, 'walk')

        expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
        expect(screen.getByText('Walk')).toBeInTheDocument()

        await user.clear(search)

        await user.click(await screen.findByLabelText('Actions for Breakfast'))
        await user.click(await screen.findByText('Edit'))

        const dialog = await screen.findByRole('dialog')
        const titleInput = within(dialog).getByLabelText('Title')

        await user.clear(titleInput)
        await user.type(titleInput, 'Morning meal')

        await user.click(
            within(dialog).getByRole('button', {
                name: 'Save changes',
            }),
        )

        await waitFor(() => {
            expect(update).toHaveBeenCalledWith(
                records[0],
                expect.objectContaining({
                    title: 'Morning meal',
                }),
            )
        })
    })

    it('uses entity identity to load meal edit detail', async () => {
        const summary: JournalEvent = {
            id: 'meal-1',
            definitionId: 'calories',
            entityType: 'meal',
            entityId: 'meal-1',
            editable: true,
            time: '12:30',
            category: 'Meals',
            title: 'Chicken bowl',
            detail: '150 g · 420 kcal',
            source: 'You',
            observedAt: '2026-08-23T12:30:00.000Z',
            version: 2,
        }
        const detail: JournalEvent = {
            ...summary,
            definitionId: 'meal',
            detailView: {
                kind: 'meal',
                mealType: 'Lunch',
                serving: { amount: 150, unit: 'g' },
                nutrients: { calories: 420, protein: 35 },
                nutritionQuality: 'complete',
                sourceItem: {
                    kind: 'food',
                    id: '11111111-1111-4111-8111-111111111111',
                },
            },
        }
        renderJournal('/', vi.fn().mockResolvedValue(true), [summary], { 'meal-1': detail })

        const user = userEvent.setup()
        await user.click(await screen.findByLabelText('Actions for Chicken bowl'))
        await user.click(await screen.findByText('Edit'))

        await waitFor(() =>
            expect(getJournalEntry).toHaveBeenCalledWith('meal-1', expect.any(AbortSignal)),
        )
        expect(await screen.findByTestId('journal-meal-editor')).toHaveTextContent('Chicken bowl')
    })

    it('loads detailed entries on demand without a second detail step or trend action', async () => {
        renderJournal('/', vi.fn().mockResolvedValue(true), [sleepRecord])

        await userEvent.click(await screen.findByText('Sleep'))

        const dialog = await screen.findByRole('dialog')
        await waitFor(() =>
            expect(getJournalEntry).toHaveBeenCalledWith('sleep-1', expect.any(AbortSignal)),
        )
        expect(within(dialog).getByText('Sleep phases')).toBeInTheDocument()
        expect(within(dialog).getByText('Pixel Watch')).toBeInTheDocument()
        expect(
            within(dialog).queryByRole('button', { name: 'View detailed sleep' }),
        ).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'View trend' })).not.toBeInTheDocument()
    })

    it('can select a specific journal day and return to all dates', async () => {
        renderJournal()

        const user = userEvent.setup()
        await user.click(await screen.findByRole('button', { name: /^Filters/ }))
        await user.click(await screen.findByText('One day'))
        await user.click(await screen.findByRole('button', { name: /^Filters/ }))
        const journalDate = await screen.findByLabelText('Journal date')
        fireEvent.change(journalDate, {
            target: { value: '2026-08-23' },
        })

        expect(await screen.findByText('Breakfast')).toBeInTheDocument()
        expect(screen.queryByText('Walk')).not.toBeInTheDocument()

        await waitFor(() =>
            expect(listJournal).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    from: '2026-08-23T00:00:00.000Z',
                    to: '2026-08-24T00:00:00.000Z',
                }),
                expect.any(AbortSignal),
            ),
        )

        await user.click(screen.getByRole('button', { name: 'Aug 23' }))
        expect(screen.getByText('Walk')).toBeInTheDocument()
    })

    it('extends an explicit date range with earlier entries', async () => {
        renderJournal('/?from=2026-08-22&to=2026-08-23')

        expect(await screen.findByText('Breakfast')).toBeInTheDocument()
        expect(screen.getByText('Walk')).toBeInTheDocument()
        expect(screen.queryByText('Earlier walk')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Show earlier' }))
        expect(await screen.findByText('Earlier walk')).toBeInTheDocument()
    })
})
