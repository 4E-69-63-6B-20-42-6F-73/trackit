import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

test.beforeEach(async ({ page }) => {
    await useAuthenticatedServer(page)
    await page.route('**/api/recipes*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
})

test('empty food library has no fabricated records', async ({ page }) => {
    await page.route('**/api/foods*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
    await page.goto('/library')
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
    await expect(page.getByText('Your food library is empty')).toBeVisible()
    await expect(page.getByText(/Rolled oats/i)).toHaveCount(0)
})

test('new food supports extended nutrient details', async ({ page }) => {
    await page.route('**/api/foods*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
    await page.goto('/library')
    await page.getByRole('button', { name: 'New food' }).click()
    await page.getByRole('button', { name: 'More nutrients' }).click()
    for (const label of ['Sugar', 'Saturated fat', 'Sodium', 'Potassium']) {
        await expect(page.getByLabel(new RegExp(label, 'i'))).toBeVisible()
    }
})

test('legacy nutrition route redirects to Library', async ({ page }) => {
    await page.route('**/api/foods*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
    await page.goto('/nutrition')
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
})
