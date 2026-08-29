import { MantineProvider } from '@mantine/core'
import { IconMoon } from '@tabler/icons-react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { MetricCard } from './MetricCard'

const record = {
    id: 'sleep-1',
    definitionId: 'sleep',
    canonicalValue: 8,
    canonicalUnit: 'hours',
    originalValue: 8,
    originalUnit: 'hours',
    observedAt: '2026-08-23T06:00:00.000Z',
    excluded: false,
    version: 1,
}

describe('MetricCard', () => {
    it('opens details from the card without a separate detail button', async () => {
        const user = userEvent.setup()
        render(
            <MantineProvider>
                <MetricCard
                    icon={IconMoon}
                    tone="indigo"
                    label="Sleep"
                    value="8h 0m"
                    note="30m higher than your 14-day rolling average"
                    record={record}
                />
            </MantineProvider>,
        )

        expect(screen.queryByRole('button', { name: 'View details' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'View Sleep details' }))
        expect(await screen.findByRole('dialog', { name: 'Sleep' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Close' }))
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Sleep' })).not.toBeInTheDocument(),
        )
    })
})
