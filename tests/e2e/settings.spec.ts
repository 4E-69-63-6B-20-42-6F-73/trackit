import { expect, test } from '@playwright/test'

test('settings sections use nested pages instead of dialogs', async ({ page }) => {
    await page.goto('/settings')
    const demo = page.getByRole('button', { name: 'Open local demo mode' })
    await demo.waitFor()
    await demo.click()

    await page.getByRole('link', { name: /Profile & units/ }).click()
    await expect(page).toHaveURL(/\/settings\/profile$/)
    await expect(page.getByRole('heading', { name: 'Profile & units' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.goBack()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.getByRole('heading', { name: 'Choose what to manage' })).toBeVisible()
})

test('an unknown settings section has an explicit recovery path', async ({ page }) => {
    await page.goto('/settings/not-a-section')
    const demo = page.getByRole('button', { name: 'Open local demo mode' })
    await demo.waitFor()
    await demo.click()

    await expect(page.getByRole('heading', { name: 'Settings page not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Return to settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
})
