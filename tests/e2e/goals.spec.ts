import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

test('creates, persists, evaluates, and edits a seven-day average weight goal', async ({
    page,
}) => {
    const goals: Record<string, unknown>[] = []
    const observations = [79, 80, 81, 80].map((value, index) => ({
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
    await useAuthenticatedServer(page, { goals, observations })
    await page.goto('/goals')

    await expect(page.getByRole('heading', { name: 'Goals', level: 1 })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'What do you want to track?' })).toHaveValue(
        'Weight',
    )
    await page.getByRole('button', { name: 'Advanced options' }).click()
    await expect(
        page.getByRole('combobox', { name: 'How should TrackIt measure progress?' }),
    ).toHaveValue('7-day average')
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('At or below')
    await page.getByLabel('Value').fill('80')
    await page.getByRole('button', { name: 'Create goal' }).click()

    await expect(page.getByRole('status')).toContainText('Goal added.')
    await expect(page.getByText('On target')).toBeVisible()
    await expect(page.locator('.goal-card .goal-target')).toHaveText('80.0 kg')
    expect(goals[0]).toMatchObject({
        metricId: 'weight',
        aggregation: 'average',
        comparator: 'lte',
        target: { value: 80 },
        period: { type: 'rolling', days: 7 },
        canonicalUnit: 'kg',
    })

    await page.reload()
    await expect(page.getByText('On target')).toBeVisible()
    await page.getByRole('button', { name: 'Actions for Weight' }).click()
    await page.getByText('Edit goal').click()
    await expect(page.getByRole('heading', { name: 'Edit goal' })).toBeVisible()
    await page.getByLabel('Value').fill('79')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status')).toContainText('Goal updated.')
    expect(goals[0]).toMatchObject({ target: { value: 79 } })
})

test('shows an informative failing status for weight above an LTE target', async ({ page }) => {
    const goals = [
        {
            id: 'failing-weight',
            metricId: 'weight',
            aggregation: 'average',
            comparator: 'lte',
            target: { value: 80 },
            period: { type: 'rolling', days: 7 },
            canonicalUnit: 'kg',
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            effectiveTo: null,
            schedule: {},
        },
    ]
    const observations = [81, 82, 81, 82].map((value, index) => ({
        id: `weight-high-${index}`,
        definitionId: 'weight',
        canonicalValue: value,
        canonicalUnit: 'kg',
        originalValue: value,
        originalUnit: 'kg',
        observedAt: new Date(Date.now() - index * 86_400_000).toISOString(),
        excluded: false,
        version: 1,
    }))
    await useAuthenticatedServer(page, { goals, observations })
    await page.goto('/goals')

    await expect(page.getByText('Not on target')).toBeVisible()
    await expect(page.locator('.goal-card .goal-target')).toHaveText('81.5 kg')
    await expect(page.getByText(/1.5 kg above target/)).toBeVisible()
})

test('creates and displays a canonical weight goal using pounds', async ({ page }) => {
    const goals: Record<string, unknown>[] = []
    const observations = [
        {
            id: 'weight-lb-display',
            definitionId: 'weight',
            canonicalValue: 80,
            canonicalUnit: 'kg',
            originalValue: 176.4,
            originalUnit: 'lb',
            observedAt: new Date().toISOString(),
            excluded: false,
            version: 1,
        },
    ]
    await useAuthenticatedServer(page, {
        goals,
        observations,
        preferences: {
            id: 'owner',
            displayName: 'Owner',
            timezone: 'UTC',
            locale: 'en-US',
            units: 'imperial',
            metricPreferences: { weight: { displayUnit: 'lb' } },
            experience: { onboardingComplete: true, onboardingStep: 5 },
        },
    })
    await page.goto('/goals')

    await expect(page.getByText('lb').first()).toBeVisible()
    await page.getByLabel('Value').fill('176.4')
    await page.getByRole('button', { name: 'Create goal' }).click()
    await expect(page.locator('.goal-card .goal-target')).toHaveText('176.4 lb')
    const target = goals[0].target as { value: number }
    expect(target.value).toBeCloseTo(80, 1)
    expect(goals[0]).toMatchObject({ canonicalUnit: 'kg' })
})

test('permanently deletes a retired goal after confirmation', async ({ page }) => {
    const goals: Record<string, unknown>[] = [
        {
            id: 'retired-weight',
            metricId: 'weight',
            aggregation: 'average',
            comparator: 'lte',
            target: { value: 80 },
            period: { type: 'rolling', days: 7 },
            canonicalUnit: 'kg',
            effectiveFrom: '2026-01-01T00:00:00.000Z',
            effectiveTo: '2026-02-01T00:00:00.000Z',
            schedule: {},
        },
    ]
    await useAuthenticatedServer(page, { goals, observations: [] })
    await page.goto('/goals')

    await page.getByRole('button', { name: 'Actions for Weight' }).click()
    await page.getByText('Delete goal').click()
    await expect(page.getByRole('dialog', { name: 'Delete this retired goal?' })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete goal' }).click()
    await expect(page.getByRole('status')).toContainText('Retired goal deleted.')
    expect(goals).toEqual([])
})
