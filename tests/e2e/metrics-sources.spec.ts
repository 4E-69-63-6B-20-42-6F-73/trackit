import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

test('configures provider-aware source priority without exposing raw internals', async ({
    page,
}) => {
    const metricSources = ['Garmin', 'Samsung Health'].map(provider => ({
        definitionId: 'steps',
        provider,
        connector: 'Health Connect',
    }))
    await useAuthenticatedServer(page, { metricSources })
    await page.goto('/library/metrics')
    await expect(page.getByRole('heading', { name: 'Metric Center', level: 1 })).toBeVisible()
    await page.getByRole('button', { name: /Configure Steps/ }).click()
    await expect(page.getByText('Garmin')).toBeVisible()
    await expect(page.getByText('via Health Connect')).toHaveCount(2)
    await expect(page.getByLabel('Move Samsung Health up')).toBeDisabled()
    await page.getByRole('combobox', { name: 'When included sources overlap' }).click()
    await page.getByRole('option', { name: 'Prefer higher-priority source' }).click()
    await page.getByLabel('Move Samsung Health up').click()
    await page
        .getByRole('switch', { name: 'Include Garmin in Steps' })
        .locator('xpath=ancestor::label')
        .click()
    await expect(page.getByText('via Health Connect · Excluded')).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
})
