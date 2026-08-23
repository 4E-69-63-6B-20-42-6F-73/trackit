import type { Page } from '@playwright/test'

/** Authenticates through a server response; no application data is stored in the browser. */
export async function useAuthenticatedServer(
    page: Page,
    options: { journal?: Record<string, unknown>[] } = {},
) {
    await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path.startsWith('/api/journal') && options.journal) {
            const request = route.request()
            if (request.method() === 'POST') {
                const input = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>
                const saved = { ...input, version: 1, source: input.source ?? 'You' }
                options.journal.unshift(saved)
                return route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: saved }),
                })
            }
            if (request.method() === 'DELETE') {
                const id = path.split('/').at(-1)
                const index = options.journal.findIndex(record => record.id === id)
                if (index >= 0) options.journal.splice(index, 1)
                return route.fulfill({ status: 204, body: '' })
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: options.journal }),
            })
        }
        if (path === '/api/meals' && route.request().method() === 'POST') {
            const input = route.request().postDataJSON()
            return route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: {
                        ...input,
                        id: input.id ?? '20000000-0000-4000-8000-000000000001',
                        nutrientSnapshot: input.nutrients ?? {},
                        version: 1,
                    },
                }),
            })
        }
        const data =
            path === '/api/preferences'
                ? {
                      id: 'owner',
                      displayName: 'Owner',
                      timezone: 'UTC',
                      locale: 'en',
                      units: 'metric',
                      goals: {},
                      mcpEnabled: false,
                      experience: { onboardingComplete: true, onboardingStep: 5 },
                  }
                : []
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
                path === '/api/auth/status' ? { configured: true, authenticated: true } : { data },
            ),
        })
    })
}
