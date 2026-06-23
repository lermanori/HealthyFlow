import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/globalSetup.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'npx tsx backend/src/index.ts',
      port: 3001,
      reuseExistingServer: true,
      timeout: 30_000,
      env: { HF_TEST_MODE: '1' },
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
