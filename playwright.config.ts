import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

const backendEnv = {
  HF_TEST_MODE: '1',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dummy',
  PORT: String(process.env.HF_E2E_API_PORT ?? 3001),
}

const reuseExistingServer = process.env.HF_TEST_MODE !== '1'

// Overridable so the suite can run from a git worktree without colliding with (or
// silently reusing) a dev server started from the main checkout, which would test
// the wrong code. Defaults to the normal ports.
const webPort = Number(process.env.HF_E2E_WEB_PORT ?? 5173)
const apiPort = Number(process.env.HF_E2E_API_PORT ?? 3001)

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
    baseURL: `http://localhost:${webPort}`,
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
      port: apiPort,
      reuseExistingServer,
      timeout: 30_000,
      env: backendEnv,
    },
    {
      command: `npx vite --port ${webPort} --strictPort`,
      port: webPort,
      reuseExistingServer,
      timeout: 30_000,
      env: { VITE_WEEK_VIEW_ENABLED: 'true' },
    },
  ],
})
