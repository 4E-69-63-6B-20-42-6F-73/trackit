import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const routes = ['/today', '/nutrition', '/journal', '/trends', '/connections', '/settings']

test('locked server state has no automatic WCAG A/AA violations', async ({ page }) => {
    await page.goto('/today')
    await page.getByRole('button', { name: 'Open local demo mode' }).waitFor()
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    expect(results.violations).toEqual([])
})

test('keyboard users can bypass repeated navigation', async ({ page }) => {
    await page.goto('/today')
    const demo = page.getByRole('button', { name: 'Open local demo mode' })
    await demo.waitFor()
    await demo.click()
    await expect(demo).toBeHidden()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
})

test('quick-add dialog has no automatic WCAG A/AA violations', async ({ page }) => {
    await page.goto('/today')
    const demo = page.getByRole('button', { name: 'Open local demo mode' })
    await demo.waitFor()
    await demo.click()
    await page.getByRole('button', { name: /quick add/i }).click()
    await page.getByRole('dialog').waitFor()
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    expect(results.violations).toEqual([])
})

test('every primary destination is reachable from navigation', async ({ page }) => {
    await page.goto('/today')
    const demo = page.getByRole('button', { name: 'Open local demo mode' })
    await demo.waitFor()
    await demo.click()
    for (const destination of [
        'Today',
        'Nutrition',
        'Journal',
        'Trends',
        'Connections',
        'Settings',
    ]) {
        await expect(
            page.getByRole('button', { name: destination, exact: true }).first(),
        ).toBeVisible()
    }
})

test('Today reflows without page-level horizontal scrolling at 320 CSS pixels', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/today')
    const demo = page.getByRole('button', { name: 'Open local demo mode' })
    await demo.waitFor()
    await demo.click()
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(320)
})

for (const route of routes) {
    test(`${route} has no automatic WCAG A/AA violations`, async ({ page }) => {
        await page.goto(route)
        const demo = page.getByRole('button', { name: 'Open local demo mode' })
        await demo.waitFor()
        await demo.click()
        await expect(demo).toBeHidden()
        await page.getByRole('heading', { level: 1 }).waitFor()
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze()
        expect(
            results.violations.map(({ help, id, impact, nodes }) => ({
                help,
                id,
                impact,
                targets: nodes.map(node => ({
                    detail: node.failureSummary,
                    html: node.html,
                    target: node.target.join(' '),
                })),
            })),
        ).toEqual([])
    })
}
