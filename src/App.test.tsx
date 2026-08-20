import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('App routing', () => {
    beforeEach(() => localStorage.clear())

    it('renders a bookmarkable journal route', async () => {
        render(
            <MantineProvider>
                <MemoryRouter initialEntries={['/journal']}>
                    <App />
                </MemoryRouter>
            </MantineProvider>,
        )

        expect(await screen.findByRole('heading', { name: 'Journal' })).toBeInTheDocument()
        expect(screen.getByText('4 entries')).toBeInTheDocument()
    })
})
