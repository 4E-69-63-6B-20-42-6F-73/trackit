import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ManualEntryLogger } from './ManualEntryLogger'
import { ServerDataProvider } from '../../hooks/useServerData'

const provider = (children: React.ReactNode) => (
    <ServerDataProvider
        initialData={{
            preferences: { displayName: 'Owner', timezone: 'UTC', locale: 'en', units: 'metric' },
        }}
    >
        {children}
    </ServerDataProvider>
)

describe('ManualEntryLogger', () => {
    it('creates a canonical water observation and closes the dialog', async () => {
        const user = userEvent.setup()
        const add = vi.fn()
        const close = vi.fn()

        render(
            <MantineProvider>
                {provider(<ManualEntryLogger opened close={close} add={add} initialKind="Water" />)}
            </MantineProvider>,
        )

        expect(screen.getByRole('button', { name: '100 ml' })).toHaveAttribute(
            'aria-pressed',
            'false',
        )
        expect(screen.getByRole('button', { name: '250 ml' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
        expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute(
            'aria-pressed',
            'false',
        )
        expect(screen.queryByLabelText('Custom amount')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Log 250 ml' }))

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                definitionId: 'water',
                valueType: 'number',
                category: 'Measurements',
                source: 'You',
                value: 250,
                unit: 'ml',
            }),
        )
        expect(close).toHaveBeenCalledOnce()
    })

    it('supports 100 ml and custom water amounts', async () => {
        const user = userEvent.setup()
        const add = vi.fn()

        render(
            <MantineProvider>
                {provider(
                    <ManualEntryLogger
                        opened
                        close={vi.fn()}
                        add={add}
                        initialKind="Water"
                    />,
                )}
            </MantineProvider>,
        )

        await user.click(screen.getByRole('button', { name: '100 ml' }))
        expect(screen.getByRole('button', { name: 'Log 100 ml' })).toBeEnabled()

        await user.click(screen.getByRole('button', { name: 'Custom' }))
        expect(screen.getByRole('button', { name: 'Log 0 ml' })).toBeDisabled()

        const amount = screen.getByLabelText('Custom amount')
        await user.type(amount, '375')
        await user.click(screen.getByRole('button', { name: 'Log 375 ml' }))

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                definitionId: 'water',
                value: 375,
                unit: 'ml',
                attributes: { description: '375 ml' },
            }),
        )
    })

    it('records against the day selected in the current page', async () => {
        const user = userEvent.setup()
        const add = vi.fn()

        render(
            <MantineProvider>
                {provider(
                    <ManualEntryLogger
                        opened
                        close={vi.fn()}
                        add={add}
                        initialKind="Weight"
                        selectedDate="2026-08-20"
                    />,
                )}
            </MantineProvider>,
        )

        expect(screen.getByText('Recording for Thu, Aug 20, 2026')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Save weight' }))

        const saved = add.mock.calls[0][0]
        const observed = new Date(saved.observedAt)
        expect(
            `${observed.getFullYear()}-${String(observed.getMonth() + 1).padStart(2, '0')}-${String(observed.getDate()).padStart(2, '0')}`,
        ).toBe('2026-08-20')
        expect(saved.definitionId).toBe('weight')
    })
})
