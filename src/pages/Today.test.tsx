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
        stepsGoal: { targetValue: 8000, canonicalUnit: 'count' },
        waterGoal: null,
        preferences: { displayName: 'Owner', timezone: 'UTC', locale: 'en', units: 'metric' },
    }),
}))

describe('Today', () => {
    it('renders actual progress and opens its contributing trends view', async () => {
        const openTrends = vi.fn()
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
        expect(screen.getByText('No sleep trend yet')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'View trends' }))
        expect(openTrends).toHaveBeenCalledOnce()
    })
})
