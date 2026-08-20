import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
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
        render(
            <MantineProvider>
                <Journal events={records} remove={vi.fn()} duplicate={duplicate} />
            </MantineProvider>,
        )
        const user = userEvent.setup()
        await user.type(screen.getByPlaceholderText('Search your journal'), 'walk')
        expect(screen.queryByText('Breakfast')).not.toBeInTheDocument()
        expect(screen.getByText('Walk')).toBeInTheDocument()
        await user.clear(screen.getByPlaceholderText('Search your journal'))
        await user.click(screen.getByLabelText('Actions for Breakfast'))
        await user.click(await screen.findByText('Duplicate'))
        expect(duplicate).toHaveBeenCalledWith(records[0])
    })
})
