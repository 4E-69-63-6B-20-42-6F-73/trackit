import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { Journal } from './Journal'
import type { JournalEvent } from '../domain/types'

const records: JournalEvent[] = [
    {
        id: '1',
        definitionId: 'meal',
        time: '08:00',
        category: 'Meals',
        title: 'Breakfast',
        detail: 'Oats',
        source: 'You',
        observedAt: '2026-08-23T08:00:00.000Z',
    },
    {
        id: '2',
        definitionId: 'walk',
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
        time: '10:00',
        category: 'Activity',
        title: 'Earlier walk',
        detail: '15 minutes',
        source: 'Health Connect',
        observedAt: '2026-08-16T10:00:00.000Z',
    },
]

describe('Journal', () => {
    it('filters records and exposes owner actions', async () => {
        const update = vi.fn().mockResolvedValue(true)

        render(
            <MemoryRouter initialEntries={['/?from=2026-08-16&to=2026-08-23']}>
                <MantineProvider>
                    <Journal events={records} remove={vi.fn()} update={update} />
                </MantineProvider>
            </MemoryRouter>,
        )

        const user = userEvent.setup()
        const search = screen.getByRole('textbox', { name: 'Search journal' })

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

    it('can select a specific journal day and return to all dates', async () => {
        render(
            <MemoryRouter>
                <MantineProvider>
                    <Journal
                        events={records}
                        remove={vi.fn()}
                        update={vi.fn().mockResolvedValue(true)}
                    />
                </MantineProvider>
            </MemoryRouter>,
        )

        const user = userEvent.setup()
        await user.click(screen.getByRole('button', { name: /^Filters/ }))
        await user.click(await screen.findByText('Single day'))
        fireEvent.change(screen.getByLabelText('Journal date'), {
            target: { value: '2026-08-23' },
        })

        expect(screen.getByText('Breakfast')).toBeInTheDocument()
        expect(screen.queryByText('Walk')).not.toBeInTheDocument()

        await user.click(screen.getByText('All entries'))
        expect(screen.getByText('Walk')).toBeInTheDocument()
    })

    it('extends the default seven-day window with earlier entries', async () => {
        render(
            <MemoryRouter>
                <MantineProvider>
                    <Journal
                        events={records}
                        remove={vi.fn()}
                        update={vi.fn().mockResolvedValue(true)}
                    />
                </MantineProvider>
            </MemoryRouter>,
        )

        expect(screen.queryByText('Earlier walk')).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Show earlier' }))
        expect(screen.getByText('Earlier walk')).toBeInTheDocument()
    })
})
