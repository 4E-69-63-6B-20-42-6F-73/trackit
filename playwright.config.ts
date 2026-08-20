import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            testIgnore: /slow-device\.spec\.ts/,
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile-chromium',
            testIgnore: /slow-device\.spec\.ts/,
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'slow-mobile-chromium',
            testMatch: /slow-device\.spec\.ts/,
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'firefox',
            testMatch: /journal\.spec\.ts/,
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            testMatch: /journal\.spec\.ts/,
            use: { ...devices['Desktop Safari'] },
        },
    ],
    webServer: {
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
    },
})
