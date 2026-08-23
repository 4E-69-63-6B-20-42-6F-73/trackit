import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

const routes = [
    '/today',
    '/nutrition',
    '/journal',
    '/goals',
    '/trends',
    '/connections',
    '/settings',
]

test.beforeEach(async ({ page }) => useAuthenticatedServer(page))

test('locked server state has no automatic WCAG A/AA violations', async ({ page }) => {
    await page.goto('/today')
    await page.getByRole('heading', { level: 1 }).waitFor()
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    expect(results.violations).toEqual([])
})

test('keyboard users can bypass repeated navigation', async ({ page }) => {
    await page.goto('/today')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
})

test('global logger has no automatic WCAG A/AA violations', async ({ page }) => {
    await page.goto('/today')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.getByRole('button', { name: 'Log health information' }).click()
    await page.getByRole('menuitem', { name: 'Weight' }).click()
    await page.getByRole('dialog').waitFor()
    const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
    expect(results.violations).toEqual([])
})

test('every primary destination is reachable from navigation', async ({ page, isMobile }) => {
    await page.goto('/today')
    await page.getByRole('heading', { level: 1 }).waitFor()
    if (isMobile) await page.getByRole('button', { name: 'More' }).click()
    for (const destination of [
        'Today',
        'Nutrition',
        'Journal',
        'Goals',
        'Trends',
        'Connections',
        'Settings',
    ]) {
        await expect(
            page.getByRole('link', { name: destination, exact: true }).first(),
        ).toBeVisible()
    }
})

test('primary navigation works by keyboard and moves focus to page content', async ({
    page,
    isMobile,
}) => {
    await page.goto('/today')
    await page.getByRole('heading', { level: 1 }).waitFor()

    if (isMobile) await page.getByRole('button', { name: 'More' }).click()
    const goalsLink = page.getByRole('link', { name: 'Goals', exact: true }).first()
    await goalsLink.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/goals$/)
    await expect(page.locator('#main-content')).toBeFocused()
    await expect(page.getByRole('heading', { name: 'Goals', level: 1 })).toBeVisible()
})

test('Today reflows without page-level horizontal scrolling at 320 CSS pixels', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/today')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(320)
})

for (const width of [1280, 1440, 1680, 1920]) {
    test(`desktop pages use ${width}px without horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/today')
        await page.getByRole('heading', { level: 1 }).waitFor()
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
            .toBeLessThanOrEqual(width)
        await page.getByRole('link', { name: 'Trends', exact: true }).first().click()
        await expect(page.getByRole('heading', { name: 'Trends', exact: true })).toBeVisible()
        await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
            .toBeLessThanOrEqual(width)
    })
}

for (const route of routes) {
    test(`${route} has no automatic WCAG A/AA violations`, async ({ page }) => {
        await page.goto(route)
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
