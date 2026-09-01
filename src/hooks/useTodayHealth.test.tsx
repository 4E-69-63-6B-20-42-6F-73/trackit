import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listDailyMetrics } from '../lib/dailyMetricApi'
import { listGoalEvaluations } from '../lib/goalApi'
import { listObservations } from '../lib/observationApi'
import { ServerDataProvider } from './useServerData'
import { useTodayHealth } from './useTodayHealth'

vi.mock('../lib/dailyMetricApi', () => ({ listDailyMetrics: vi.fn() }))
vi.mock('../lib/observationApi', () => ({ listObservations: vi.fn() }))
vi.mock('../lib/goalApi', () => ({ listGoalEvaluations: vi.fn() }))

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
        <ServerDataProvider
            initialData={{
                preferences: {
                    displayName: 'Alex',
                    timezone: 'UTC',
                    locale: 'en-US',
                    units: 'metric',
                    metricPreferences: {
                        steps: {
                            displayUnit: 'count',
                            deduplication: {
                                policy: 'prefer_priority',
                                sourcePriority: ['Health Connect::Garmin'],
                                disabledSources: ['Health Connect::Samsung Health'],
                            },
                        },
                    },
                },
            }}
        >
            {children}
        </ServerDataProvider>
    </QueryClientProvider>
)

describe('useTodayHealth effective totals', () => {
    beforeEach(() => {
        queryClient.clear()
        vi.mocked(listGoalEvaluations).mockResolvedValue({})
        vi.mocked(listDailyMetrics).mockResolvedValue([
            {
                date: '2026-08-25',
                definitionId: 'steps',
                value: 7000,
                unit: 'count',
                derivationVersion: 1,
            },
        ])
        vi.mocked(listObservations).mockResolvedValue([
            {
                id: 'garmin-steps',
                definitionId: 'steps',
                canonicalValue: 7000,
                canonicalUnit: 'count',
                originalValue: 7000,
                originalUnit: 'count',
                observedAt: '2026-08-25T12:00:00.000Z',
                provider: 'Garmin',
                connector: 'Health Connect',
                excluded: false,
                version: 1,
            },
        ])
    })

    it('uses the source-resolved daily cache and loads all detail observations for one day', async () => {
        const { result } = renderHook(() => useTodayHealth(new Date('2026-08-25T12:00:00Z')), {
            wrapper,
        })

        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(result.current.steps).toBe(7000)
        expect(listDailyMetrics).toHaveBeenCalledWith(
            { from: '2026-07-27', to: '2026-08-25' },
            expect.any(AbortSignal),
        )
        const observationRange = vi.mocked(listObservations).mock.calls.at(-1)?.[0]
        expect(observationRange).toBeDefined()
        expect(
            new Date(observationRange!.to!).getTime() - new Date(observationRange!.from!).getTime(),
        ).toBe(86_400_000)
        expect(observationRange!.definitionIds).toBeUndefined()
        expect(listGoalEvaluations).toHaveBeenCalledWith(
            expect.any(AbortSignal),
            '2026-08-25T23:59:59.999Z',
        )
    })
})
