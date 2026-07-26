/**
 * Origin of the backend the e2e suite talks to directly (test-reset, seeding,
 * and API route mocks).
 *
 * Specs used to hard-code http://localhost:3001. That breaks when the suite runs
 * from a git worktree: Playwright starts its own backend on a free port, but the
 * hard-coded URL still hits whatever dev server owns 3001 — usually a checkout of
 * different code, running without HF_TEST_MODE, so /test/reset is disabled and
 * every spec that resets state fails for a reason that has nothing to do with the
 * change under test.
 *
 * Keep this in sync with HF_E2E_API_PORT in playwright.config.ts.
 */
export const API_ORIGIN = `http://localhost:${process.env.HF_E2E_API_PORT ?? 3001}`
