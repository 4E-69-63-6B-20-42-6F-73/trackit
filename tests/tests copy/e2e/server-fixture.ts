import type { Page } from '@playwright/test'
import { evaluateGoal, type Goal } from '../../src/domain/goals'
import type { Observation } from '../../src/domain/health'

/** Authenticates through a server response; no application data is stored in the browser. */
export async function useAuthenticatedServer(
    page: Page,
    options: {
        journal?: Record<string, unknown>[]
        goals?: Record<string, unknown>[]
        observations?: Record<string, unknown>[]
        preferences?: Record<string, unknown>
    } = {},
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
        if (path === '/api/goals' && options.goals) {
            if (route.request().method() === 'POST') {
                const input = route.request().postDataJSON()
                const saved = { id: `goal-${options.goals.length + 1}`, ...input }
                options.goals.unshift(saved)
                return route.fulfill({
                    status: 201,
                    contentType: 'application/json',
                    body: JSON.stringify({ data: saved }),
                })
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: options.goals }),
            })
        }
        if (path === '/api/goals/evaluations' && options.goals) {
            const requestUrl = new URL(route.request().url())
            const evaluatedAt = requestUrl.searchParams.get('at')
            const now = evaluatedAt ? new Date(evaluatedAt) : new Date()
            const timezone = String(options.preferences?.timezone ?? 'UTC')
            const evaluations = Object.fromEntries(
                options.goals.map(goal => [
                    String(goal.id),
                    evaluateGoal(
                        goal as Goal,
                        (options.observations ?? []) as unknown as Observation[],
                        now,
                        timezone,
                    ),
                ]),
            )
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: evaluations }),
            })
        }
        if (
            path.startsWith('/api/goals/') &&
            options.goals &&
            route.request().method() === 'PATCH'
        ) {
            const id = path.split('/').at(-1)
            const index = options.goals.findIndex(goal => goal.id === id)
            const saved = { ...options.goals[index], ...route.request().postDataJSON(), id }
            if (index >= 0) options.goals[index] = saved
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: saved }),
            })
        }
        if (
            path.startsWith('/api/goals/') &&
            options.goals &&
            route.request().method() === 'DELETE'
        ) {
            const id = path.split('/').at(-1)
            const index = options.goals.findIndex(goal => goal.id === id && goal.effectiveTo)
            if (index < 0)
                return route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: 'retire_before_delete' }),
                })
            options.goals.splice(index, 1)
            return route.fulfill({ status: 204, body: '' })
        }
        if (path === '/api/observations' && options.observations) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ data: options.observations }),
            })
        }
        if (path === '/api/data-summary') {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    data: {
                        count: 0,
                        oldest: null,
                        newest: null,
                        lastRetentionRun: null,
                    },
                }),
            })
        }
        const data =
            path === '/api/preferences'
                ? (options.preferences ?? {
                      id: 'owner',
                      displayName: 'Owner',
                      timezone: 'UTC',
                      locale: 'en',
                      units: 'metric',
                      goals: {},
                      mcpEnabled: false,
                      experience: { onboardingComplete: true, onboardingStep: 5 },
                  })
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
