import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MantineProvider } from '@mantine/core'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMcpStatus } from '../../../lib/mcpApi'
import { McpNew } from './new'

vi.mock('../../../lib/mcpApi', () => ({
    getMcpStatus: vi.fn(),
    issueMcpClient: vi.fn(),
}))

describe('new MCP assistant permissions', () => {
    beforeEach(() => {
        vi.mocked(getMcpStatus).mockResolvedValue({
            enabled: true,
            clients: [],
            allowedOrigins: [],
        })
    })

    it('toggles permission switches without retaining the React event', async () => {
        const user = userEvent.setup()
        render(
            <MantineProvider>
                <MemoryRouter>
                    <McpNew />
                </MemoryRouter>
            </MantineProvider>,
        )

        const measurements = await screen.findByRole('switch', {
            name: /Measurements & insights/,
        })
        const meals = screen.getByRole('switch', { name: /Meals/ })
        expect(measurements).toBeChecked()
        expect(meals).not.toBeChecked()
        expect(
            screen.getByText('View metric definitions and measurement history for trend analysis.'),
        ).toBeInTheDocument()

        await user.click(measurements)
        await user.click(meals)

        expect(measurements).not.toBeChecked()
        expect(meals).toBeChecked()
    })
})
