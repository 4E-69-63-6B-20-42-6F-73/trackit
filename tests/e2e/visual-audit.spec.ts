import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

test.beforeEach(async ({ page }) => useAuthenticatedServer(page))

const pages = [
    ['today', '/today'],
    ['journal', '/journal'],
    ['nutrition', '/nutrition'],
    ['goals', '/goals'],
    ['trends', '/trends'],
    ['connections', '/connections'],
    ['settings', '/settings'],
    ['settings-profile', '/settings/profile'],
    ['settings-privacy', '/settings/privacy'],
    ['settings-security', '/settings/security'],
    ['settings-system', '/settings/system'],
] as const

test('capture every page for visual review', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const size = testInfo.project.name === 'mobile-chromium' ? 'mobile' : 'desktop'
    const output = `docs/ui-screenshots/${size}`
    await mkdir(output, { recursive: true })

    for (const [name, route] of pages) {
        await page.goto(route)
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
    }
})
