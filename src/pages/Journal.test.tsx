import { MantineProvider } from '@mantine/core'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Journal } from './Journal'
import type { JournalEvent } from '../domain/types'

const records: JournalEvent[] = [
    {
        id: '1',
        time: '08:00',
        category: 'Meals',
        title: 'Breakfast',
        detail: 'Oats',
        source: 'You',
    },
    {
        id: '2',
        time: '09:00',
        category: 'Activity',
        title: 'Walk',
        detail: '20 minutes',
        source: 'Health Connect',
    },
]

describe('Journal', () => {
    it('filters records and exposes owner actions', async () => {
        const duplicate = vi.fn()
        const update = vi.fn().mockResolvedValue(true)

        render(
            <MantineProvider>
                <Journal events={records} remove={vi.fn()} duplicate={duplicate} update={update} />
            </MantineProvider>,
        )

        const user = userEvent.setup()
        const search = screen.getByPlaceholderText('Search your journal')

        await user.type(search, 'walk')

        expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
        expect(screen.getByText('Walk')).toBeInTheDocument()

        await user.clear(search)

        await user.click(await screen.findByLabelText('Actions for Breakfast'))
        await user.click(await screen.findByText('Log a copy'))

        expect(duplicate).toHaveBeenCalledWith(records[0])

        await waitFor(() => {
            expect(screen.queryByText('Log a copy')).not.toBeInTheDocument()
        })

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
})
