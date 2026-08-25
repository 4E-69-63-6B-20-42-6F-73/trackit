import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Today } from './Today'
import { ServerDataProvider } from '../hooks/useServerData'

vi.mock('../hooks/useTodayHealth', () => ({
    useTodayHealth: () => ({
        loading: false,
        unavailable: false,
        steps: 4321,
        water: 1.5,
        sleepToday: null,
        restingHeartRate: null,
        energy: null,
        weight: null,
        sleepSeries: [],
        sleepBaseline: null,
        restingBaseline: null,
        stepsGoal: {
            id: 'steps-goal',
            metricId: 'steps',
            aggregation: 'total',
            comparator: 'gte',
            target: { value: 8000 },
            period: { type: 'day' },
            canonicalUnit: 'count',
        },
        waterGoal: null,
        goalEvaluations: {
            'steps-goal': {
                value: 4321,
                met: false,
                progress: 4321 / 8000,
                observationCount: 1,
                periodStart: '2026-08-25T00:00:00Z',
                periodEnd: '2026-08-25T12:00:00Z',
                difference: 3679,
            },
        },
        preferences: { displayName: 'Owner', timezone: 'UTC', locale: 'en', units: 'metric' },
    }),
}))

describe('Today', () => {
    it('renders actual progress and opens its contributing trends view', async () => {
        const openTrends = vi.fn()
        const openLogger = vi.fn()
        render(
            <MantineProvider>
                <ServerDataProvider
                    initialData={{
                        preferences: {
                            displayName: 'Owner',
                            timezone: 'UTC',
                            locale: 'en',
                            units: 'metric',
                        },
                    }}
                >
                    <Today
                        events={[]}
                        insight={false}
                        dismissInsight={vi.fn()}
                        openJournal={vi.fn()}
                        openTrends={openTrends}
                        openLogger={openLogger}
                    />
                </ServerDataProvider>
            </MantineProvider>,
        )

        expect(
            Number(screen.getByLabelText('Daily steps progress').getAttribute('aria-valuenow')),
        ).toBeCloseTo(54.0125)
        expect(
            screen.getByText((_text, element) =>
                Boolean(element?.tagName === 'STRONG' && element.textContent?.includes('4')),
            ),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Set a water goal' })).toBeInTheDocument()
        expect(screen.queryByLabelText('Daily water progress')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Check in now' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Check in now' }))
        expect(openLogger).toHaveBeenCalledWith('energy')
        expect(screen.getByText('No sleep trend yet')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'View trends' }))
        expect(openTrends).toHaveBeenCalledOnce()
    })
})
