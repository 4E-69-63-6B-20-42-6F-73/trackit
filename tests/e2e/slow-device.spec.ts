import { expect, test } from '@playwright/test'

test('primary dashboard interaction remains responsive on a throttled phone', async ({
    page,
    browserName,
}) => {
    test.skip(browserName !== 'chromium')
    const session = await page.context().newCDPSession(page)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.route('**/*', async route => {
        if (route.request().resourceType() !== 'document')
            await new Promise(resolve => setTimeout(resolve, 75))
        await route.continue()
    })

    await page.goto('/today')
    const demo = page.getByRole('button', { name: 'Open local demo mode' })
    await demo.waitFor()
    await demo.click()
    await expect(
        page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ }),
    ).toBeVisible({
        timeout: 8_000,
    })
    await page.getByRole('button', { name: /quick add/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.unrouteAll({ behavior: 'wait' })
    await session.detach()
})
