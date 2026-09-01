import { MantineProvider } from '@mantine/core'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import App from './App'
import { ServerDataProvider } from './hooks/useServerData'
import { LoggingProvider } from './logging/LoggingContext'
import { createTestQueryClient } from './test/queryClient'

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

const renderApp = (entry: string) => {
    const queryClient = createTestQueryClient()
    return render(
        <MantineProvider>
            <MemoryRouter initialEntries={[entry]}>
                <QueryClientProvider client={queryClient}>
                    <ServerDataProvider initialData={initialData}>
                        <LoggingProvider>
                            <App />
                        </LoggingProvider>
                    </ServerDataProvider>
                </QueryClientProvider>
            </MemoryRouter>
        </MantineProvider>,
    )
}

describe('App routing', () => {
    it('renders a bookmarkable journal route', async () => {
        renderApp('/journal')

        expect(
            await screen.findByRole('heading', { name: 'Journal' }, { timeout: 5_000 }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Your observations in chronological order, with their recorded source and detail intact.',
            ),
        ).toBeInTheDocument()
    })

    it('renders a bookmarkable plan route', async () => {
        renderApp('/plan?date=2026-09-02')

        expect(
            await screen.findByRole('heading', { name: 'Plan', level: 1 }, { timeout: 5_000 }),
        ).toBeInTheDocument()
        expect(
            screen.getByText(
                'Plan meals ahead. They become part of your health record only when logged.',
            ),
        ).toBeInTheDocument()
        expect(
            screen.queryByText('Meals are intentions until they are logged.'),
        ).not.toBeInTheDocument()
    })

    it('renders a bookmarkable goals route', async () => {
        renderApp('/goals')

        expect(
            await screen.findByRole('heading', { name: 'Goals', level: 1 }, { timeout: 5_000 }),
        ).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Add a goal' })).toBeInTheDocument()
    })

    it.each([
        ['/library/foods', 'Foods'],
        ['/library/recipes', 'Recipes'],
    ])('renders the bookmarkable %s route', async (route, heading) => {
        renderApp(route)

        expect(
            await screen.findByRole('heading', { name: heading, level: 1 }, { timeout: 5_000 }),
        ).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Back to Library' })).toHaveAttribute(
            'href',
            '/library',
        )
    })
})
