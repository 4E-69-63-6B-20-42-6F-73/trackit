import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

test('an Observation projection survives reload and can be deleted from Journal', async ({
    page,
}) => {
    const records: Record<string, unknown>[] = []
    const observations: Record<string, unknown>[] = []
    await useAuthenticatedServer(page, { journal: records, observations })

    await page.goto('/journal')
    await page.evaluate(async () => {
        const response = await fetch('/api/observations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                id: '30000000-0000-4000-8000-000000000001',
                definitionId: 'note',
                valueType: 'text',
                category: 'Check-ins',
                title: 'Dinner',
                textValue: 'Lentil soup',
                source: 'You',
                observedAt: new Date().toISOString(),
                time: '18:00',
            }),
        })
        if (!response.ok) throw new Error(`Create failed: ${response.status}`)
    })
    await expect.poll(() => records.length).toBe(1)
    await page.reload()
    await expect(page.getByText('Lentil soup')).toBeVisible()
    await page.reload()
    await expect(page.getByText('Lentil soup')).toBeVisible()

    await page.getByLabel(/Actions for (Lunch|Dinner)/).click()
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await page.getByRole('button', { name: 'Delete entry' }).click()
    await expect(page.getByText('Lentil soup')).not.toBeVisible()
    expect(records).toHaveLength(0)
})
