import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

const backendEnv = {
  HF_TEST_MODE: '1',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dummy',
}

const reuseExistingServer = process.env.HF_TEST_MODE !== '1'

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/globalSetup.ts',
  fullyParallel: false,
  // Serial: every spec resets the ONE shared Supabase test user via POST /test/reset,
  // so parallel workers would clobber each other's data mid-run. workers:1 gives each
  // spec true isolation. (#37 flake policy: revisit if we move to per-worker test users.)
  workers: 1,
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
      reuseExistingServer,
      timeout: 30_000,
      env: backendEnv,
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer,
      timeout: 30_000,
    },
  ],
})
