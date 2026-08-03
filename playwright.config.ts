import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

const backendEnv = {
  HF_TEST_MODE: '1',
  SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://localhost',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dummy',
  PORT: String(process.env.HF_E2E_API_PORT ?? 3001),
}

// Overridable so the suite can run from a git worktree without colliding with (or
// touching) a dev server started from the main checkout. E2E never reuses an
// existing backend because it must guarantee HF_TEST_MODE=1 account safeguards.
const webPort = Number(process.env.HF_E2E_WEB_PORT ?? 5173)
const apiPort = Number(process.env.HF_E2E_API_PORT ?? 3001)

// Specs that mock every response they need and never write through the API. They
// do not touch the one durable Supabase test user, so they are the only ones safe
// to run with more than one worker (see the workers: 1 note below).
const HERMETIC = [
  'assistant',
  'module-presentation',
  'responsive-visual-system',
  'today-focus-block',
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
  auth: ['auth', 'onboarding', 'demo-funnel'],
  today: ['today-workspace', 'today-anytime-drag', 'today-date-navigation', 'day-summary', 'today-focus-block'],
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
  // Snapshot names deliberately exclude {projectName}. The same spec renders the
  // same pixels whichever subject project runs it, and the default template bakes
  // the project into the filename — so splitting the suite into subjects would
  // otherwise orphan every committed baseline (they were all written as
  // "-chromium-darwin.png") and silently ask for 68 new ones.
  snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
  expect: {
    toHaveScreenshot: {
      // Measured, not guessed: baselines written on one machine reproduce on
      // another at a diff ratio of ~0.01 (font smoothing / GPU rasterisation),
      // while the genuine layout changes we have seen came in at 0.02-0.04 AND
      // changed the image dimensions. A size mismatch fails regardless of this
      // threshold, so real layout regressions are still caught; this only stops
      // the suite failing because it ran on a different Mac.
      maxDiffPixelRatio: 0.015,
    },
  },
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
      reuseExistingServer: false,
      timeout: 30_000,
      env: backendEnv,
    },
    {
      command: `npx vite --port ${webPort} --strictPort`,
      port: webPort,
      reuseExistingServer: false,
      timeout: 30_000,
      // Production keeps opt-in features hidden by default. E2E enables them
      // so their existing behavior remains covered behind the release flags.
      env: {
        // Never inherit a production VITE_API_URL from the developer's shell.
        VITE_API_URL: `http://localhost:${apiPort}/api`,
        VITE_WEEK_VIEW_ENABLED: 'true',
        VITE_DAILY_SIGNALS_ENABLED: 'true',
        VITE_SUPABASE_URL: `http://localhost:${webPort}/supabase-auth`,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      },
    },
  ],
})
