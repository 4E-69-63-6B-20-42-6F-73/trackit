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
    await page.goto('/library/foods')
    await expect(page.getByRole('heading', { name: 'Foods', level: 1 })).toBeVisible()
    await expect(page.getByText('Your food library is empty')).toBeVisible()
    await expect(page.getByText(/Rolled oats/i)).toHaveCount(0)
})

test('new food supports extended nutrient details', async ({ page }) => {
    await page.route('**/api/foods*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
    await page.goto('/library/foods')
    await page.getByRole('button', { name: 'New food' }).click()
    await page.getByRole('button', { name: 'More nutrients' }).click()
    for (const label of ['Sugar', 'Saturated fat', 'Sodium', 'Potassium']) {
        await expect(page.getByLabel(new RegExp(label, 'i'))).toBeVisible()
    }
})

test('food editor fits a narrow viewport and can permanently delete a food', async ({ page }) => {
    await page.setViewportSize({ width: 559, height: 840 })
    let deleted = false
    const food = {
        id: 'd4799323-056d-4b83-a274-3776e03380e0',
        name: 'Plain Skyr',
        brand: 'Generic',
        barcode: null,
        catalogSource: null,
        catalogId: null,
        caloriesPer100g: 63,
        proteinPer100g: 11,
        carbsPer100g: 4,
        fatPer100g: 0.2,
        fiberPer100g: null,
        sugarPer100g: 4,
        saturatedFatPer100g: null,
        sodiumPer100g: null,
        potassiumPer100g: null,
        servingName: 'serving',
        servingGrams: 100,
        favorite: false,
        nutritionQuality: 'estimated',
        version: 1,
    }
    await page.route('**/api/foods*', route => {
        if (route.request().method() === 'DELETE') {
            deleted = true
            return route.fulfill({ status: 204, body: '' })
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: deleted ? [] : [food] }),
        })
    })

    await page.goto('/library/foods')
    await page.getByRole('button', { name: /Plain Skyr/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit Plain Skyr' })
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)

    await page.getByRole('button', { name: 'Delete food' }).click()
    await page.getByRole('button', { name: 'Delete permanently' }).click()

    await expect(dialog).toBeHidden()
    expect(deleted).toBe(true)
    await expect(page.getByText('Plain Skyr')).toHaveCount(0)
})

test('legacy nutrition route redirects to Library', async ({ page }) => {
    await page.route('**/api/foods*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
    await page.goto('/nutrition')
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole('heading', { name: 'Library', level: 1 })).toBeVisible()
})
