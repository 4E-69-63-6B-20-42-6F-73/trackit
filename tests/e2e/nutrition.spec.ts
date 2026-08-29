import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

test.beforeEach(async ({ page }) => useAuthenticatedServer(page))

test('a recent meal can be repeated in one interaction and under 20 seconds', async ({ page }) => {
    let postCount = 0
    let repeatedNutrients: Record<string, number> | undefined
    const recentMeal = {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Fast porridge',
        mealType: 'Breakfast',
        eatenAt: '2026-08-20T08:00:00.000Z',
        nutrientSnapshot: {
            calories: 320,
            protein: 16,
            carbs: 45,
            fat: 8,
            fiber: 7,
            sugar: 6,
            saturatedFat: 2,
            sodium: 180,
            potassium: 410,
        },
        favorite: true,
        version: 1,
        nutritionQuality: 'complete',
    }
    await page.route('**/api/meals*', async route => {
        if (route.request().method() === 'POST') {
            postCount += 1
            repeatedNutrients = route.request().postDataJSON().nutrients
            await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [recentMeal] }),
        })
    })
    await page.route('**/api/recipes*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
    await page.route('**/api/foods*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )

    await page.goto('/nutrition')
    const repeat = page.getByRole('button', { name: 'Log again' })
    await expect(repeat).toBeVisible()

    const started = Date.now()
    await repeat.click()
    await expect(page.getByText('Fast porridge logged again.')).toBeVisible()
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(postCount).toBe(1)
    expect(repeatedNutrients).toMatchObject({
        sugar: 6,
        saturatedFat: 2,
        sodium: 180,
        potassium: 410,
    })
})

test('empty food library has no fabricated nutrition records', async ({ page }) => {
    await page.route('**/api/foods*', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
    )
    await page.goto('/nutrition')
    await expect(page.getByText('Your food library is empty')).toBeVisible()
    await expect(page.getByText(/Rolled oats/i)).toHaveCount(0)
})

test('new food supports extended nutrient details', async ({ page }) => {
    await page.goto('/nutrition')
    await page.getByRole('button', { name: 'New food' }).click()
    await page.getByRole('button', { name: 'More nutrients' }).click()
    for (const label of ['Sugar', 'Saturated fat', 'Sodium', 'Potassium']) {
        await expect(page.getByLabel(new RegExp(label, 'i'))).toBeVisible()
    }
})
