import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'
import { ServerDataProvider } from './hooks/useServerData'

const initialData = {
    preferences: {
        displayName: 'Owner',
        timezone: 'UTC',
        locale: 'en',
        units: 'metric' as const,
        experience: { onboardingComplete: true },
    },
    goals: [],
}

describe('App routing', () => {
    it('renders a bookmarkable journal route', async () => {
        render(
            <MantineProvider>
                <MemoryRouter initialEntries={['/journal']}>
                    <ServerDataProvider initialData={initialData}>
                        <App />
                    </ServerDataProvider>
                </MemoryRouter>
            </MantineProvider>,
        )

        expect(
            await screen.findByRole('heading', { name: 'Journal' }, { timeout: 5_000 }),
        ).toBeInTheDocument()
        expect(screen.getByText('0 entries')).toBeInTheDocument()
        expect(screen.getByText('Your journal is ready')).toBeInTheDocument()
    })

    it('renders a bookmarkable goals route', async () => {
        render(
            <MantineProvider>
                <MemoryRouter initialEntries={['/goals']}>
                    <ServerDataProvider initialData={initialData}>
                        <App />
                    </ServerDataProvider>
                </MemoryRouter>
            </MantineProvider>,
        )

        expect(
            await screen.findByRole('heading', { name: 'Goals', level: 1 }, { timeout: 5_000 }),
        ).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Add a goal' })).toBeInTheDocument()
    })
})
