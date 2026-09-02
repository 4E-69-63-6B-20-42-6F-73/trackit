import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerDataProvider } from '../hooks/useServerData'
import { evaluateGoal, type Goal } from '@trackit/domain/goals'
import type { NumericObservation } from '@trackit/domain/health'
import type { Preferences } from '../lib/preferencesApi'
import { createGoal, deleteGoal, listGoalEvaluations, updateGoal } from '../lib/goalApi'
import { GoalsPanel } from './GoalsPanel'

vi.mock('../lib/goalApi', () => ({
    listGoals: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    retireGoal: vi.fn(),
    deleteGoal: vi.fn(),
    listGoalEvaluations: vi.fn(),
}))

const preferences: Preferences = {
    displayName: 'Alex',
    timezone: 'UTC',
    locale: 'en-US',
    units: 'metric',
}
const goal: Goal = {
    id: 'weight-goal',
    definitionId: 'weight',
    aggregation: 'average',
    comparator: 'lte',
    target: { value: 80 },
    period: { type: 'rolling', days: 7 },
    canonicalUnit: 'kg',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    schedule: {},
}
const observations: NumericObservation[] = [79, 80, 81, 80].map((value, index) => ({
    id: `weight-${index}`,
    definitionId: 'weight',
    canonicalValue: value,
    canonicalUnit: 'kg',
    originalValue: value,
    originalUnit: 'kg',
    observedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    excluded: false,
    version: 1,
}))
const renderPanel = (goals: Goal[] = [], savedPreferences = preferences) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <MemoryRouter>
            <MantineProvider>
                <QueryClientProvider client={queryClient}>
                    <ServerDataProvider initialData={{ preferences: savedPreferences, goals }}>
                        <GoalsPanel />
                    </ServerDataProvider>
                </QueryClientProvider>
            </MantineProvider>
        </MemoryRouter>,
    )
}
const choose = async (user: ReturnType<typeof userEvent.setup>, label: string, option: string) => {
    await user.click(screen.getByRole('combobox', { name: label }))
    const match = screen
        .getAllByRole('option', { hidden: true })
        .find(item => item.textContent?.trim() === option)
    expect(match).toBeDefined()
    await user.click(match!)
}

describe('GoalsPanel', () => {
    beforeEach(() => {
        vi.mocked(createGoal).mockReset()
        vi.mocked(updateGoal).mockReset()
        vi.mocked(deleteGoal).mockReset()
        vi.mocked(listGoalEvaluations).mockResolvedValue({
            [goal.id]: evaluateGoal(goal, observations, new Date(), 'UTC'),
        })
        Element.prototype.scrollIntoView = vi.fn()
    })

    it('renders the persisted rolling weight goal and its evaluated status', async () => {
        renderPanel([goal])
        expect(await screen.findByText('On target')).toBeInTheDocument()
        expect(screen.getAllByText('7-day average')).not.toHaveLength(0)
        expect(screen.getByText('80.0 kg')).toBeInTheDocument()
        expect(screen.getByText('Target: at or below 80.0 kg')).toBeInTheDocument()
    })

    it('keeps valid timing defaults visible and maps schedule presets to weekdays', async () => {
        const user = userEvent.setup()
        vi.mocked(createGoal).mockImplementation(async input => ({ id: 'saved', ...input }))
        renderPanel()

        expect(screen.getByRole('combobox', { name: 'How often?' })).toHaveValue('Every day')
        await user.click(screen.getByRole('button', { name: 'Advanced options' }))
        expect(
            await screen.findByRole('combobox', { name: 'How should TrackIt measure progress?' }),
        ).toHaveValue('7-day average')
        expect(await screen.findByLabelText('Starts')).not.toHaveValue('')
        expect(screen.getByLabelText('Ends (optional)')).toHaveValue('')

        await choose(user, 'How often?', 'Weekdays')
        await user.click(screen.getByRole('button', { name: 'Create goal' }))
        await waitFor(() => expect(createGoal).toHaveBeenCalledOnce())
        expect(vi.mocked(createGoal).mock.calls[0][0].schedule.weekdays).toEqual([1, 2, 3, 4, 5])
    })

    it('reveals day choices only for Custom and requires at least one', async () => {
        const user = userEvent.setup()
        renderPanel()
        await choose(user, 'How often?', 'Custom days')
        const days = screen.getByRole('group', { name: 'Custom days' })
        expect(within(days).getByLabelText('Monday')).toBeVisible()
        for (const day of [
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
            'Sunday',
        ])
            await user.click(within(days).getByLabelText(day))
        await user.click(screen.getByRole('button', { name: 'Create goal' }))
        expect(
            await screen.findByText('Choose at least one day for a custom schedule.'),
        ).toBeVisible()
        expect(createGoal).not.toHaveBeenCalled()
    })

    it('shows chosen dates in the timing controls and prevents an end before the start', async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole('button', { name: 'Advanced options' }))
        const startDate = await screen.findByLabelText('Starts')
        fireEvent.change(startDate, { target: { value: '2026-09-10' } })
        expect(startDate).toHaveValue('2026-09-10')

        const endDate = screen.getByLabelText('Ends (optional)')
        expect(endDate).toHaveAttribute('min', '2026-09-10')
        fireEvent.change(endDate, { target: { value: '2026-09-01' } })
        expect(endDate).toBeInvalid()
        await user.click(screen.getByRole('button', { name: 'Create goal' }))
        expect(createGoal).not.toHaveBeenCalled()
    })

    it('derives measurement options by metric and saves pound input canonically', async () => {
        const user = userEvent.setup()
        vi.mocked(createGoal).mockImplementation(async input => ({ id: 'saved', ...input }))
        renderPanel([], {
            ...preferences,
            metricPreferences: { weight: { displayUnit: 'lb' } },
        })

        expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('80')
        expect(screen.getByText('lb')).toBeInTheDocument()
        await user.clear(screen.getByRole('textbox', { name: 'Value' }))
        await user.type(screen.getByRole('textbox', { name: 'Value' }), '176.3698')
        await user.click(screen.getByRole('button', { name: 'Create goal' }))

        await waitFor(() => expect(createGoal).toHaveBeenCalledOnce())
        const saved = vi.mocked(createGoal).mock.calls[0][0]
        expect(saved).toMatchObject({
            definitionId: 'weight',
            aggregation: 'average',
            comparator: 'lte',
            period: { type: 'rolling', days: 7 },
            canonicalUnit: 'kg',
        })
        expect('value' in saved.target && saved.target.value).toBeCloseTo(80, 3)

        await choose(user, 'What do you want to track?', 'Steps')
        await user.click(screen.getByRole('button', { name: 'Advanced options' }))
        expect(
            await screen.findByRole('combobox', { name: 'How should TrackIt measure progress?' }),
        ).toHaveValue('Daily total')
        expect(screen.getByRole('combobox', { name: 'Target' })).toHaveValue('At least')
        expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('10000')
    })

    it('uses friendly guidance when the current period has no observations', async () => {
        vi.mocked(listGoalEvaluations).mockResolvedValue({})
        renderPanel([goal])
        expect(await screen.findByText('Nothing recorded yet')).toBeVisible()
        expect(screen.getByText('Record weight to see progress.')).toBeVisible()
    })

    it('shows range inputs, validates them, and populates edit fields', async () => {
        const user = userEvent.setup()
        vi.mocked(updateGoal).mockImplementation(async (id, input) => ({ id, ...input }))
        renderPanel([goal])

        await choose(user, 'Target', 'Between')
        expect(screen.getByRole('textbox', { name: 'Minimum' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Maximum' })).toBeInTheDocument()
        await user.clear(screen.getByRole('textbox', { name: 'Minimum' }))
        await user.type(screen.getByRole('textbox', { name: 'Minimum' }), '83')
        await user.clear(screen.getByRole('textbox', { name: 'Maximum' }))
        await user.type(screen.getByRole('textbox', { name: 'Maximum' }), '82')
        await user.click(screen.getByRole('button', { name: 'Create goal' }))
        expect(
            await screen.findByText('Range minimum must be at or below its maximum.'),
        ).toBeVisible()
        expect(createGoal).not.toHaveBeenCalled()

        const card = screen
            .getAllByText('7-day average')
            .map(item => item.closest('article'))
            .find(Boolean)!
        await user.click(within(card).getByRole('button', { name: 'Actions for Weight' }))
        await user.click(await screen.findByText('Edit goal'))
        expect(screen.getByRole('heading', { name: 'Edit goal' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('80')
        await user.click(screen.getByRole('button', { name: 'Save changes' }))
        await waitFor(() =>
            expect(updateGoal).toHaveBeenCalledWith('weight-goal', expect.anything()),
        )
    })

    it('offers permanent deletion only for a retired goal and confirms it', async () => {
        const user = userEvent.setup()
        const retired = { ...goal, effectiveTo: '2026-01-02T00:00:00.000Z' }
        vi.mocked(deleteGoal).mockResolvedValue(undefined)
        renderPanel([retired])

        await user.click(await screen.findByRole('button', { name: 'Actions for Weight' }))
        await user.click(await screen.findByText('Delete goal'))
        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: 'Delete this retired goal?' })).toBeVisible(),
        )
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete goal' }),
        )
        await waitFor(() => expect(deleteGoal).toHaveBeenCalledOnce())
        expect(vi.mocked(deleteGoal).mock.calls[0][0]).toEqual(retired)
    })
})
