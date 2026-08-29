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

        const healthData = await screen.findByRole('switch', { name: 'Health data' })
        const meals = screen.getByRole('switch', { name: 'Meals' })
        expect(healthData).toBeChecked()
        expect(meals).not.toBeChecked()

        await user.click(healthData)
        await user.click(meals)

        expect(healthData).not.toBeChecked()
        expect(meals).toBeChecked()
    })
})
