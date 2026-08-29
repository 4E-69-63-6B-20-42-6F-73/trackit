import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ManualEntryLogger } from './ManualEntryLogger'
import { ServerDataProvider } from '../../hooks/useServerData'

const provider = (
    children: React.ReactNode,
    metricPreferences?: { water: { displayUnit: string } },
) => (
    <ServerDataProvider
        initialData={{
            preferences: {
                displayName: 'Owner',
                timezone: 'UTC',
                locale: 'en',
                units: 'metric',
                metricPreferences,
            },
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
                    <ManualEntryLogger opened close={vi.fn()} add={add} initialKind="Water" />,
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

    it('uses the Metric Center water unit for presets', async () => {
        const user = userEvent.setup()
        const add = vi.fn()

        render(
            <MantineProvider>
                {provider(
                    <ManualEntryLogger opened close={vi.fn()} add={add} initialKind="Water" />,
                    { water: { displayUnit: 'L' } },
                )}
            </MantineProvider>,
        )

        expect(screen.getByRole('button', { name: '0.1 L' })).toHaveAttribute(
            'aria-pressed',
            'false',
        )
        expect(screen.getByRole('button', { name: '0.25 L' })).toHaveAttribute(
            'aria-pressed',
            'true',
        )
        expect(screen.getByRole('button', { name: 'Log 0.25 L' })).toBeEnabled()

        await user.click(screen.getByRole('button', { name: '0.1 L' }))
        await user.click(screen.getByRole('button', { name: 'Log 0.1 L' }))

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                definitionId: 'water',
                value: 100,
                unit: 'ml',
                attributes: { description: '0.1 L' },
            }),
        )
    })

    it('converts custom water using the Metric Center water unit', async () => {
        const user = userEvent.setup()
        const add = vi.fn()

        render(
            <MantineProvider>
                {provider(
                    <ManualEntryLogger opened close={vi.fn()} add={add} initialKind="Water" />,
                    { water: { displayUnit: 'L' } },
                )}
            </MantineProvider>,
        )

        await user.click(screen.getByRole('button', { name: 'Custom' }))
        const amount = screen.getByLabelText('Custom amount')
        await user.type(amount, '0.3')
        await user.click(screen.getByRole('button', { name: 'Log 0.3 L' }))

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                definitionId: 'water',
                value: 300,
                unit: 'ml',
                attributes: { description: '0.3 L' },
            }),
        )
    })

    it('uses a discrete low-to-high slider for energy check-ins', async () => {
        const user = userEvent.setup()
        const add = vi.fn()

        render(
            <MantineProvider>
                {provider(
                    <ManualEntryLogger opened close={vi.fn()} add={add} initialKind="Check-in" />,
                )}
            </MantineProvider>,
        )

        const slider = screen.getByRole('slider', { name: 'Energy level' })
        expect(slider).toHaveAttribute('aria-valuemin', '1')
        expect(slider).toHaveAttribute('aria-valuemax', '10')
        expect(slider).toHaveAttribute('aria-valuenow', '5')
        expect(screen.getByText('5 · Neutral')).toBeInTheDocument()
        expect(screen.getByText('Low')).toBeInTheDocument()
        expect(screen.getByText('Neutral')).toBeInTheDocument()
        expect(screen.getByText('High')).toBeInTheDocument()

        slider.focus()
        await user.keyboard('{ArrowRight}{ArrowRight}')
        expect(slider).toHaveAttribute('aria-valuenow', '7')
        expect(screen.getByText('7 · High')).toBeInTheDocument()

        await user.type(screen.getByLabelText('Note (optional)'), 'After lunch')
        await user.click(screen.getByRole('button', { name: 'Save check-in' }))

        expect(add).toHaveBeenCalledWith(
            expect.objectContaining({
                definitionId: 'energy',
                value: 7,
                unit: 'score',
                attributes: { description: '7 out of 10 · After lunch' },
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
