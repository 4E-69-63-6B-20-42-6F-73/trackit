import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

test.beforeEach(async ({ page }) => useAuthenticatedServer(page))

test('settings sections use nested pages instead of dialogs', async ({ page }) => {
    await page.goto('/settings')

    await page.getByRole('link', { name: /Profile & units/ }).click()
    await expect(page).toHaveURL(/\/settings\/profile$/)
    await expect(page.getByRole('heading', { name: 'Profile & units' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.goBack()
    await expect(page).toHaveURL(/\/settings$/)
    if ((page.viewportSize()?.width ?? 1000) > 760) {
        await expect(page.getByRole('heading', { name: 'Dashboard & reminders' })).toBeVisible()
    } else {
        await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()
    }
})

test('an unknown settings section has an explicit recovery path', async ({ page }) => {
    await page.goto('/settings/not-a-section')

    if ((page.viewportSize()?.width ?? 1000) > 760) {
        await expect(page.getByRole('heading', { name: 'Settings page not found' })).toBeVisible()
        await page.getByRole('link', { name: 'Return to settings' }).click()
        await expect(page).toHaveURL(/\/settings$/)
    } else {
        await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()
    }
})
