import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { useAuthenticatedServer } from './server-fixture'

const now = new Date()
const day = (offset: number) => {
    const date = new Date(now)
    date.setDate(date.getDate() + offset)
    return date.toISOString().slice(0, 10)
}

const journal = [
    {
        id: 'j1',
        time: '17:15',
        category: 'Check-ins',
        title: 'Energy check-in',
        detail: '7 out of 10',
        source: 'You',
        observedAt: `${day(0)}T17:15:00.000Z`,
    },
    {
        id: 'j2',
        time: '15:37',
        category: 'Measurements',
        title: 'Water',
        detail: '250 ml',
        source: 'You',
        observedAt: `${day(0)}T15:37:00.000Z`,
    },
    {
        id: 'j3',
        time: '15:37',
        category: 'Activity',
        title: 'Exercise',
        detail: 'Exercise 11 minutes',
        source: 'Google Fit',
        deviceName: 'Pixel 9',
        observedAt: `${day(0)}T15:37:00.000Z`,
    },
    {
        id: 'j4',
        time: '22:41',
        category: 'Sleep',
        title: 'Sleep',
        detail: '7h 42m',
        source: 'Health Connect',
        deviceName: 'Pixel 9',
        observedAt: `${day(-1)}T22:41:00.000Z`,
    },
    {
        id: 'j5',
        time: '12:05',
        category: 'Meals',
        title: 'Lunch',
        detail: 'Chicken salad · 540 kcal',
        source: 'You',
        observedAt: `${day(-2)}T12:05:00.000Z`,
    },
] as Record<string, unknown>[]

const devices = [
    {
        id: 'd-pending',
        name: 'Samsung Galaxy S24',
        keyFingerprint: 'SHA256:8c:31:aa:91:22:5f',
        status: 'pending',
        confirmedAt: null,
        configuredAt: null,
        revokedAt: null,
        lastSeenAt: null,
        createdAt: `${day(0)}T16:00:00.000Z`,
        sync: [],
    },
    {
        id: 'd-active',
        name: 'Pixel 9',
        keyFingerprint: 'SHA256:42:cc:18:77:9a:ef',
        status: 'active',
        confirmedAt: `${day(-20)}T10:00:00.000Z`,
        configuredAt: `${day(-20)}T10:05:00.000Z`,
        revokedAt: null,
        lastSeenAt: `${day(0)}T17:10:00.000Z`,
        createdAt: `${day(-20)}T09:55:00.000Z`,
        sync: [
            {
                recordType: 'sleep_session',
                status: 'ok',
                lastSyncedAt: `${day(0)}T07:00:00.000Z`,
                diagnostic: null,
            },
            {
                recordType: 'heart_rate',
                status: 'ok',
                lastSyncedAt: `${day(0)}T17:10:00.000Z`,
                diagnostic: null,
            },
            {
                recordType: 'body_measurements',
                status: 'idle',
                lastSyncedAt: `${day(-2)}T08:00:00.000Z`,
                diagnostic: null,
            },
        ],
    },
    {
        id: 'd-revoked',
        name: 'Old Pixel 7',
        keyFingerprint: 'SHA256:11:03:ba:67:99:cd',
        status: 'revoked',
        confirmedAt: `${day(-200)}T10:00:00.000Z`,
        configuredAt: `${day(-200)}T10:05:00.000Z`,
        revokedAt: `${day(-30)}T12:00:00.000Z`,
        lastSeenAt: `${day(-31)}T20:00:00.000Z`,
        createdAt: `${day(-200)}T09:55:00.000Z`,
        sync: [],
    },
]

const clients = [
    {
        id: 'm1',
        name: 'Claude Desktop',
        scopes: ['observations', 'journal'],
        dateFrom: null,
        dateTo: null,
        expiresAt: null,
        revokedAt: null,
        lastUsedAt: `${day(0)}T16:42:00.000Z`,
        createdAt: `${day(-10)}T10:00:00.000Z`,
    },
    {
        id: 'm2',
        name: 'Nutrition coach',
        scopes: ['meals', 'meals:write'],
        dateFrom: `${day(-30)}T00:00:00.000Z`,
        dateTo: null,
        expiresAt: `${day(30)}T23:59:59.999Z`,
        revokedAt: null,
        lastUsedAt: `${day(-1)}T12:10:00.000Z`,
        createdAt: `${day(-5)}T10:00:00.000Z`,
    },
    {
        id: 'm3',
        name: 'Old assistant',
        scopes: ['observations'],
        dateFrom: null,
        dateTo: null,
        expiresAt: `${day(-1)}T23:59:59.999Z`,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: `${day(-60)}T10:00:00.000Z`,
    },
]

test.beforeEach(async ({ page }) => {
    await useAuthenticatedServer(page, { journal })
    await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/api/devices') return route.fulfill({ json: { data: devices } })
        if (path === '/api/mcp/status') return route.fulfill({ json: { enabled: true, clients } })
        if (path === '/api/mcp/access-log')
            return route.fulfill({
                json: {
                    data: [
                        {
                            id: 'a1',
                            actor: 'mcp:m1',
                            action: 'mcp.request',
                            targetId: 'list_observations',
                            createdAt: `${day(0)}T16:42:00.000Z`,
                        },
                        {
                            id: 'a2',
                            actor: 'mcp:m2',
                            action: 'mcp.request',
                            targetId: 'create_meal',
                            createdAt: `${day(-1)}T12:10:00.000Z`,
                        },
                    ],
                },
            })
        if (path === '/api/daily-metrics')
            return route.fulfill({
                json: {
                    data: [
                        ...Array.from({ length: 8 }, (_, index) => ({
                            date: day(index - 7),
                            metric: 'sleep',
                            value: 7.1 + index * 0.08,
                            unit: 'hours',
                            derivationVersion: 1,
                        })),
                        ...Array.from({ length: 8 }, (_, index) => ({
                            date: day(index - 7),
                            metric: 'resting_heart_rate',
                            value: 64 - index * 0.25,
                            unit: 'bpm',
                            derivationVersion: 1,
                        })),
                        ...Array.from({ length: 8 }, (_, index) => ({
                            date: day(index - 7),
                            metric: 'energy',
                            value: 6 + (index % 2),
                            unit: 'score',
                            derivationVersion: 1,
                        })),
                        ...Array.from({ length: 8 }, (_, index) => ({
                            date: day(index - 7),
                            metric: 'weight',
                            value: 75 - index * 0.1,
                            unit: 'kg',
                            derivationVersion: 1,
                        })),
                        {
                            date: day(0),
                            metric: 'steps',
                            value: 8240,
                            unit: 'count',
                            derivationVersion: 1,
                        },
                        {
                            date: day(0),
                            metric: 'water',
                            value: 1650,
                            unit: 'ml',
                            derivationVersion: 1,
                        },
                    ],
                },
            })
        if (path === '/api/observations') return route.fulfill({ json: { data: [] } })
        return route.fallback()
    })
})

const screens = [
    ['today', '/today'],
    ['journal', '/journal'],
    ['connections', '/connections'],
    ['devices', '/connections/devices'],
    ['assistants', '/connections/mcp'],
    ['assistant-new', '/connections/mcp/new'],
] as const

test('capture touched screens for review', async ({ page }, testInfo) => {
    const size = testInfo.project.name === 'mobile-chromium' ? 'mobile' : 'desktop'
    const output = `docs/ui-screenshots/review/${size}`
    await mkdir(output, { recursive: true })
    for (const [name, route] of screens) {
        await page.goto(route)
        await expect(page.locator('.page-content')).toBeVisible()
        await page.waitForTimeout(500)
        await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
    }
})
