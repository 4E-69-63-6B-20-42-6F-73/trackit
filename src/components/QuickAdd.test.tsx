import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { QuickAdd } from './QuickAdd'

describe('QuickAdd', () => {
    it('creates a meal and closes the dialog', async () => {
        const user = userEvent.setup()
        const add = vi.fn()
        const close = vi.fn()

        render(
            <MantineProvider>
                <QuickAdd opened close={close} add={add} />
            </MantineProvider>,
        )

        await user.type(screen.getByLabelText('What did you have?'), 'Soup and bread')
        await user.click(screen.getByRole('button', { name: 'Save meal' }))

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'Meals',
                title: 'Lunch',
                detail: 'Soup and bread',
                source: 'You',
            }),
        )
        expect(close).toHaveBeenCalledOnce()
    })

    it('warns before preserving an intentional duplicate', async () => {
        const user = userEvent.setup()
        const add = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)

        render(
            <MantineProvider>
                <QuickAdd opened close={vi.fn()} add={add} />
            </MantineProvider>,
        )

        await user.click(screen.getByRole('button', { name: 'Save meal' }))
        expect(screen.getByText('This may already be logged')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Log anyway' }))
        expect(add).toHaveBeenLastCalledWith(expect.any(Object), true)
    })
})
