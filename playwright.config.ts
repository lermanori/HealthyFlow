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

// Specs that mock every response they need and never write through the API. They
// do not touch the one seeded Supabase test user, so they are the only ones safe
// to run with more than one worker (see the workers: 1 note below).
const HERMETIC = [
  'assistant',
  'module-presentation',
  'responsive-visual-system',
  'today-workspace',
  'week-theme-visual',
] as const

// Subjects, so a change to one area can be verified against that area alone
// instead of waiting 6.5 minutes for the whole suite to report one result.
//
// These are a strict PARTITION: every spec belongs to exactly one subject, so
// running all projects runs every test exactly once. If a spec appeared twice,
// a default run would execute it twice and the totals would silently inflate.
const SUBJECTS: Record<string, readonly string[]> = {
  auth: ['auth', 'onboarding'],
  today: ['today-workspace', 'today-anytime-drag', 'today-date-navigation', 'day-summary'],
  items: ['items-add', 'items-lifecycle', 'rollover'],
  habits: ['habits', 'habit-progress'],
  health: ['health-workflow', 'calories-quick-insert', 'workouts', 'module-presentation'],
  talk: ['assistant'],
  week: ['week-view', 'week-theme-visual'],
  platform: ['phase0-reliability', 'settings-subscription'],
  visual: ['responsive-visual-system'],
}

const subjectProjects = Object.entries(SUBJECTS).map(([name, specs]) => ({
  name,
  testMatch: specs.map((spec) => `**/${spec}.spec.ts`),
  use: {
    ...devices['Desktop Chrome'],
    storageState: 'tests/e2e/.auth/user.json',
  },
  dependencies: ['setup'],
}))

export const hermeticSpecs = HERMETIC

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
    // The subjects partition the suite, so `npx playwright test` still runs every
    // spec exactly once — it just reports them under a subject name instead of
    // one undifferentiated "chromium". `--project=<subject>` runs one area.
    ...subjectProjects,
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
      // Production keeps Week hidden by default. E2E explicitly enables the
      // mature route so its existing behavior remains covered behind the flag.
      env: { VITE_WEEK_VIEW_ENABLED: 'true' },
    },
  ],
})
