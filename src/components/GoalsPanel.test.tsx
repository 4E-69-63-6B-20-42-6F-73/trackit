import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerDataProvider } from '../hooks/useServerData'
import type { Goal } from '../domain/goals'
import type { Observation } from '../domain/health'
import type { Preferences } from '../lib/preferencesApi'
import { createGoal, deleteGoal, updateGoal } from '../lib/goalApi'
import { listObservations } from '../lib/observationApi'
import { GoalsPanel } from './GoalsPanel'

vi.mock('../lib/goalApi', () => ({
    listGoals: vi.fn(),
    createGoal: vi.fn(),
    updateGoal: vi.fn(),
    retireGoal: vi.fn(),
    deleteGoal: vi.fn(),
}))
vi.mock('../lib/observationApi', () => ({ listObservations: vi.fn() }))

const preferences: Preferences = {
    displayName: 'Alex',
    timezone: 'UTC',
    locale: 'en-US',
    units: 'metric',
}
const goal: Goal = {
    id: 'weight-goal',
    metricId: 'weight',
    aggregation: 'average',
    comparator: 'lte',
    target: { value: 80 },
    period: { type: 'rolling', days: 7 },
    canonicalUnit: 'kg',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveTo: null,
    schedule: {},
}
const observations: Observation[] = [79, 80, 81, 80].map((value, index) => ({
    id: `weight-${index}`,
    metric: 'weight',
    canonicalValue: value,
    canonicalUnit: 'kg',
    originalValue: value,
    originalUnit: 'kg',
    observedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    excluded: false,
    version: 1,
}))
const renderPanel = (goals: Goal[] = [], savedPreferences = preferences) =>
    render(
        <MantineProvider>
            <ServerDataProvider initialData={{ preferences: savedPreferences, goals }}>
                <GoalsPanel />
            </ServerDataProvider>
        </MantineProvider>,
    )
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
        vi.mocked(listObservations).mockResolvedValue(observations)
        Element.prototype.scrollIntoView = vi.fn()
    })

    it('renders the persisted rolling weight goal and its evaluated status', async () => {
        renderPanel([goal])
        expect(await screen.findByText('On target')).toBeInTheDocument()
        expect(screen.getAllByText('7-day average')).not.toHaveLength(0)
        expect(screen.getByText('80.0 kg')).toBeInTheDocument()
        expect(screen.getByText(/Goal ≤ 80.0 kg/)).toBeInTheDocument()
    })

    it('keeps valid timing defaults visible and maps schedule presets to weekdays', async () => {
        const user = userEvent.setup()
        vi.mocked(createGoal).mockImplementation(async input => ({ id: 'saved', ...input }))
        renderPanel()

        expect(screen.getByText('Timing')).toBeVisible()
        expect(screen.getByText('Optional')).toBeVisible()
        expect(screen.getByText('Active period')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Goal start' })).toHaveTextContent('Starts today')
        expect(screen.getByRole('button', { name: 'Goal end' })).toHaveTextContent('No end date')
        expect(screen.getByRole('combobox', { name: 'Goal schedule' })).toHaveValue('Every day')
        expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('End date')).not.toBeInTheDocument()

        await choose(user, 'Goal schedule', 'Weekdays')
        await user.click(screen.getByRole('button', { name: 'Create goal' }))
        await waitFor(() => expect(createGoal).toHaveBeenCalledOnce())
        expect(vi.mocked(createGoal).mock.calls[0][0].schedule.weekdays).toEqual([1, 2, 3, 4, 5])
    })

    it('reveals day choices only for Custom and requires at least one', async () => {
        const user = userEvent.setup()
        renderPanel()
        await choose(user, 'Goal schedule', 'Custom')
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

    it('shows chosen dates in the timing controls and rejects an end before the start', async () => {
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole('button', { name: 'Goal start' }))
        const startDate = await screen.findByLabelText('Start date')
        fireEvent.change(startDate, { target: { value: '2026-09-10' } })
        expect(screen.getByRole('button', { name: 'Goal start' })).toHaveTextContent('Sep 10, 2026')

        await user.click(screen.getByRole('button', { name: 'Goal end' }))
        const endDate = await screen.findByLabelText('End date')
        fireEvent.change(endDate, { target: { value: '2026-09-01' } })
        await user.click(screen.getByRole('button', { name: 'Create goal' }))
        expect(await screen.findByText('End date must be on or after start date.')).toBeVisible()
    })

    it('derives measurement options by metric and saves pound input canonically', async () => {
        const user = userEvent.setup()
        vi.mocked(createGoal).mockImplementation(async input => ({ id: 'saved', ...input }))
        renderPanel([], {
            ...preferences,
            units: 'imperial',
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
            metricId: 'weight',
            aggregation: 'average',
            comparator: 'lte',
            period: { type: 'rolling', days: 7 },
            canonicalUnit: 'kg',
        })
        expect('value' in saved.target && saved.target.value).toBeCloseTo(80, 3)

        await choose(user, 'Metric', 'Steps')
        expect(screen.getByRole('combobox', { name: 'Measure' })).toHaveValue('Daily total')
        expect(screen.getByRole('combobox', { name: 'Target' })).toHaveValue('At least')
        expect(screen.getByRole('textbox', { name: 'Value' })).toHaveValue('10000')
    })

    it('uses friendly guidance when the current period has no observations', async () => {
        vi.mocked(listObservations).mockResolvedValue([])
        renderPanel([goal])
        expect(await screen.findByText('Nothing recorded yet')).toBeVisible()
        expect(screen.getByText('Record weight to see how this goal is tracking.')).toBeVisible()
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

        await user.click(screen.getByRole('button', { name: 'Actions for Weight' }))
        await user.click(await screen.findByText('Delete goal'))
        await waitFor(() =>
            expect(screen.getByRole('dialog', { name: 'Delete this retired goal?' })).toBeVisible(),
        )
        await user.click(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete goal' }),
        )
        await waitFor(() => expect(deleteGoal).toHaveBeenCalledWith(retired))
    })
})
