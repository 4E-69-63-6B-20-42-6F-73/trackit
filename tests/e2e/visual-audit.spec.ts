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
    ['metrics', '/metrics'],
    ['connections', '/connections'],
    ['settings', '/settings'],
    ['settings-profile', '/settings/profile'],
    ['settings-privacy', '/settings/privacy'],
    ['settings-security', '/settings/security'],
    ['settings-system', '/settings/system'],
] as const

for (const [name, route] of pages) {
    test(`capture ${name} for visual review`, async ({ page }, testInfo) => {
        const size = testInfo.project.name === 'mobile-chromium' ? 'mobile' : 'desktop'
        const output = `docs/ui-screenshots/${size}`
        await mkdir(output, { recursive: true })
        for (let attempt = 0; attempt < 3; attempt += 1) {
            await page.goto(route)
            try {
                await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({
                    timeout: 10_000,
                })
                break
            } catch (error) {
                if (attempt === 2) throw error
                await page.waitForTimeout(750 * (attempt + 1))
            }
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
                break
            } catch (error) {
                if (attempt === 2) throw error
                await page.waitForTimeout(250 * (attempt + 1))
            }
        }
    })
}
