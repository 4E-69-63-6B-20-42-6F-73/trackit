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

        await user.click(screen.getByRole('button', { name: 'Log 250 ml' }))

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                definitionId: 'water',
                valueType: 'number',
                category: 'Measurements',
                source: 'You',
            }),
        )
        expect(close).toHaveBeenCalledOnce()
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

        expect(screen.getByText(/Record this for .+20/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Save weight' }))

        const saved = add.mock.calls[0][0]
        const observed = new Date(saved.observedAt)
        expect(
            `${observed.getFullYear()}-${String(observed.getMonth() + 1).padStart(2, '0')}-${String(observed.getDate()).padStart(2, '0')}`,
        ).toBe('2026-08-20')
        expect(saved.definitionId).toBe('weight')
    })
})
