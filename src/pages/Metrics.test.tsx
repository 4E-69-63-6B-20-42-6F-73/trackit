import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerDataProvider } from '../hooks/useServerData'
import { listMetricSources } from '../lib/observationApi'
import { updatePreferences, type Preferences } from '../lib/preferencesApi'
import { Metrics } from './Metrics'

vi.mock('../lib/preferencesApi', () => ({ getPreferences: vi.fn(), updatePreferences: vi.fn() }))
vi.mock('../lib/observationApi', () => ({ listMetricSources: vi.fn() }))

const base: Preferences = { displayName: 'Alex', timezone: 'UTC', locale: 'en-US' }
const renderPage = (preferences = base) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <MantineProvider>
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>
                    <ServerDataProvider initialData={{ preferences }}>
                        <Metrics />
                    </ServerDataProvider>
                </MemoryRouter>
            </QueryClientProvider>
        </MantineProvider>,
    )
}

describe('Metric Center', () => {
    beforeEach(() => {
        vi.mocked(updatePreferences).mockReset()
        vi.mocked(listMetricSources).mockResolvedValue([])
        Element.prototype.scrollIntoView = vi.fn()
    })
    it('renders registered metrics and saves a selected unit', async () => {
        vi.mocked(updatePreferences).mockResolvedValue({
            ...base,
            metricPreferences: { weight: { displayUnit: 'lb' } },
        })
        renderPage()
        const back = screen.getByRole('link', { name: 'Back to Library' })
        expect(back).toHaveAttribute('href', '/library')
        expect(back.closest('.page-header-copy')).not.toBeNull()
        expect(await screen.findByText('Resting heart rate')).toBeInTheDocument()
        expect(screen.getByText('min')).toBeInTheDocument()
        expect(screen.getAllByText('h').length).toBeGreaterThan(0)
        expect(screen.getByText('steps').closest('.metric-row')).not.toHaveAttribute('disabled')
        await userEvent.click(screen.getByRole('button', { name: /Configure Weight/ }))
        await userEvent.click(await screen.findByRole('radio', { name: 'Pounds (lb)' }))
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(updatePreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    metricPreferences: expect.objectContaining({
                        weight: expect.objectContaining({ displayUnit: 'lb' }),
                    }),
                }),
            ),
        )
    })
    it('persists display precision for weight', async () => {
        vi.mocked(updatePreferences).mockResolvedValue(base)
        renderPage()
        await userEvent.click(await screen.findByRole('button', { name: /Configure Weight/ }))
        await userEvent.click(await screen.findByRole('radio', { name: /2 — 80.00 kg/ }))
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(updatePreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    metricPreferences: expect.objectContaining({
                        weight: expect.objectContaining({ precision: 2 }),
                    }),
                }),
            ),
        )
    })
    it('restores a persisted custom unit', async () => {
        renderPage({ ...base, metricPreferences: { weight: { displayUnit: 'lb' } } })
        expect(screen.getAllByText('Custom')).not.toHaveLength(0)
        await waitFor(() => expect(screen.getByRole('radio', { name: 'Custom' })).toBeEnabled())
        await userEvent.click(screen.getByRole('button', { name: /Configure Weight/ }))
        expect(await screen.findByRole('radio', { name: 'Pounds (lb)' })).toBeChecked()
    })
    it('applies the imperial display preset from the registry', async () => {
        vi.mocked(updatePreferences).mockResolvedValue(base)
        renderPage()
        await userEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
        await waitFor(() =>
            expect(updatePreferences).toHaveBeenCalledWith(
                expect.objectContaining({
                    metricPreferences: expect.objectContaining({
                        weight: { displayUnit: 'lb' },
                        water: { displayUnit: 'fl oz' },
                    }),
                }),
            ),
        )
        expect(vi.mocked(updatePreferences).mock.calls.at(-1)?.[0]).not.toHaveProperty('units')
    })
    it('shows provider-aware sources and persists overlap priority', async () => {
        vi.mocked(listMetricSources).mockResolvedValue([
            {
                definitionId: 'steps',
                provider: 'Garmin',
                connector: 'Health Connect',
            },
            {
                definitionId: 'steps',
                provider: 'Samsung Health',
                connector: 'Health Connect',
            },
        ])
        vi.mocked(updatePreferences).mockImplementation(async input => ({ ...base, ...input }))
        renderPage()
        await userEvent.click(await screen.findByRole('button', { name: /Configure Steps/ }))
        expect(await screen.findByText('Garmin')).toBeInTheDocument()
        expect(await screen.findAllByText('via Health Connect')).toHaveLength(2)
        expect(screen.getByText('Included')).toBeInTheDocument()
        expect(screen.getByLabelText('Move Samsung Health up')).toBeDisabled()
        await userEvent.click(
            screen.getByRole('combobox', { name: 'When included sources overlap' }),
        )
        await userEvent.keyboard('{ArrowDown}{Enter}')
        expect(screen.getByLabelText('Move Samsung Health up')).toBeEnabled()
        await userEvent.click(screen.getByLabelText('Move Samsung Health up'))
        await userEvent.click(screen.getByLabelText('Include Garmin in Steps'))
        expect(screen.getByText('via Health Connect · Excluded')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(updatePreferences).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    metricPreferences: expect.objectContaining({
                        steps: expect.objectContaining({
                            deduplication: {
                                policy: 'prefer_priority',
                                sourcePriority: [
                                    'Health Connect::Samsung Health',
                                    'Health Connect::Garmin',
                                ],
                                disabledSources: ['Health Connect::Garmin'],
                            },
                        }),
                    }),
                }),
            ),
        )
    })
})
