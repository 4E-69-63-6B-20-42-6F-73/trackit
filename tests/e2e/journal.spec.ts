import { expect, test, type Page } from '@playwright/test'

const enterDemo = async (page: Page) => {
    const button = page.getByRole('button', { name: 'Open local demo mode' })
    await button.waitFor()
    await button.click()
    await expect(button).toBeHidden()
}

test('quick add persists and can be deleted from the journal', async ({ page }) => {
    await page.goto('/today')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    await enterDemo(page)

    await page.getByRole('button', { name: /quick add/i }).click()
    const mealDescription = page.getByLabel('What did you have?')
    await mealDescription.pressSequentially('Lentil soup')
    await expect(mealDescription).toHaveValue('Lentil soup')
    await page.getByRole('button', { name: 'Save meal' }).click()

    await page.getByRole('button', { name: 'Journal', exact: true }).first().click()
    await expect(page.getByText('Lentil soup')).toBeVisible()
    await page.reload()
    await enterDemo(page)
    await expect(page.getByText('Lentil soup')).toBeVisible()

    await page.getByLabel('Actions for Lunch').click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete entry' }).click()
    await expect(page.getByText('Lentil soup')).not.toBeVisible()
})
