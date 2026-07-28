# E2E Tests

Playwright golden-path specs against the real Vite frontend + Express backend. **Regression gate before publishing**: if `npm run test:e2e` is green, the golden paths still work.

## Setup

```sh
npx playwright install chromium
```

## Running

```sh
npm run test:e2e         # headless (default; 87 tests, serial)
npm run test:e2e:headed  # visible browser
OPENAI_API_KEY= npm run test:e2e  # confirm suite works without OpenAI key
```

## What the suite covers

20 spec files, 87 tests. Listed per spec rather than per test — enumerating every
test here guarantees the list goes stale.

| Spec | Tests | Purpose |
|------|------:|---------|
| `auth.spec.ts` | 3 | Login, logout, session persistence across reload |
| `onboarding.spec.ts` | 2 | First-run onboarding complete / skip |
| `items-add.spec.ts` | 3 | Add an Item; categories match the closed set in CONTEXT.md |
| `items-lifecycle.spec.ts` | 13 | Complete, edit, delete, reschedule — persisted across reload |
| `today-workspace.spec.ts` | 15 | The Today surface: timeline, records, summary strip |
| `today-anytime-drag.spec.ts` | 6 | Anytime backlog ↔ clock drag, and its persistence |
| `today-date-navigation.spec.ts` | 4 | Moving across days keeps the right day's data |
| `day-summary.spec.ts` | 2 | `/day-summary` shape against full fixtures |
| `rollover.spec.ts` | 1 | Incomplete untimed Tasks carry forward |
| `habits.spec.ts` | 2 | Per-day completion does not bleed into tomorrow |
| `habit-progress.spec.ts` | 1 | Target-based Habits and progress chunks |
| `health-workflow.spec.ts` | 6 | The Health workspace end to end |
| `calories-quick-insert.spec.ts` | 1 | Quick-insert into the Calorie log |
| `workouts.spec.ts` | 3 | Workout sessions, plans, history |
| `module-presentation.spec.ts` | 2 | Hiding a Health section removes nav / Add targets, keeps data |
| `assistant.spec.ts` | 4 | Talk: parse, confirm, cancel, conversations |
| `settings-subscription.spec.ts` | 1 | Credits and the subscribe / top-up contact flow |
| `phase0-reliability.spec.ts` | 10 | Error states, empty states, a11y smoke |
| `week-view.spec.ts` | 5 | Week placement and habit consistency (flag forced on) |
| `week-theme-visual.spec.ts` | 3 | Screenshot diffs for Midnight / White themes |

Week is off in production (`VITE_WEEK_VIEW_ENABLED` unset). `playwright.config.ts`
forces the flag on for the suite so the route stays covered while it is hidden.

## What the suite intentionally does NOT cover

- **AI correctness**: AI call outputs are stubbed (see below); this suite does not test OpenAI API calls or prompt quality. That belongs in the `ai-harness` layer.
- **Performance**: No load testing, no timing assertions.
- **Visual regression beyond theming**: only `week-theme-visual.spec.ts` and the `today-workspace` snapshots do screenshot diffs; there is no general visual-regression net.
- **Parallelism**: All specs run serially (workers: 1) because they share one test user and reset it, so concurrent workers clobber each other. A follow-up to re-enable parallelism is per-worker test users.

## Test infrastructure

- Tests run against the **existing Supabase dev DB** — no separate test database.
- A dedicated test user (`e2e@test.healthyflow.local`) is seeded idempotently by `globalSetup.ts` at suite startup.
- The backend must be started with `HF_TEST_MODE=1`; `playwright.config.ts` does this automatically via `webServer`.
- Do not commit `.env`; Supabase credentials must be present locally.

## Resetting test data

### `/test/reset` endpoint

`POST /test/reset` is only mounted when `HF_TEST_MODE=1` (404 in production). It truncates the seeded test user's tasks so each spec starts clean. It is NOT called by specs directly; instead, **each spec resets via `globalSetup.ts` at suite startup**.

**Important gotcha**: `page.goto('/test/reset')` does NOT work (SPA catches all routes). Specs that need to reset mid-run must use:

```typescript
await page.request.post('http://localhost:3001/test/reset')
```

No specs currently reset mid-run (globalSetup suffices), but document this for future use.

## Auth fixture

Specs use Playwright's `storageState` feature to persist login state. Workflow:

1. `auth.setup.ts` (setup project) logs in once and saves state to `tests/e2e/.auth/user.json`.
2. Chromium specs load that state via `use: { storageState: 'tests/e2e/.auth/user.json' }` (configured in `playwright.config.ts`).
3. Tests in the `authenticated flows` block use the saved state; tests in `unauthenticated flows` explicitly clear it with `test.use({ storageState: { cookies: [], origins: [] } })`.

## AI network stubs

All AI endpoints (`/api/ai/*`) are intercepted by Playwright before they reach the backend or OpenAI. This means the suite runs green with `OPENAI_API_KEY` unset.

### How it works

Every spec imports `{ test, expect }` from `./fixtures/ai-stubs` instead of `@playwright/test`. The stub fixture extends Playwright's `page` fixture to register `page.route()` handlers that reply with committed JSON fixtures before any request leaves the browser.

```
tests/e2e/fixtures/
├── ai-stubs.ts          ← shared fixture; import from here in all specs
└── ai/
    ├── tips.json        ← GET /api/ai/tips
    ├── motivation.json  ← GET /api/ai/motivation
    ├── parse-tasks.json ← POST /api/ai/parse-tasks
    └── query-tasks.json ← POST /api/ai/query-tasks
```

`auth.setup.ts` remains on `@playwright/test` directly (it's a setup project, not a spec).

### Adding a new AI fixture

1. Add `tests/e2e/fixtures/ai/<endpoint>.json` with the response shape your frontend component expects.
2. Add a `page.route()` handler in `tests/e2e/fixtures/ai-stubs.ts` mapping the URL pattern to the new file:
   ```typescript
   await page.route('**/api/ai/my-new-endpoint', (route) =>
     route.fulfill({ path: path.join(FIXTURES, 'my-new-endpoint.json'), contentType: 'application/json' })
   )
   ```

## Viewing traces on failure

When a spec fails, Playwright captures a trace (visible browser state) and a screenshot (`on-first-retry` mode in `playwright.config.ts`). View them:

```sh
npx playwright show-trace test-results/[spec-name]-[attempt].trace
```

Local runs do not retry (retries: 0); CI retries once (retries: 1) so traces appear only on second failure attempt.

## Flake-quarantine policy

A spec that flakes (fails then passes on retry) twice within a calendar week is immediately `test.fixme()`'d with a comment linking to a new GitHub issue for investigation.

```typescript
test.fixme('my flaky test', async ({ page }) => {
  // #45: flaked on 2026-06-23 and 2026-06-24; quarantined pending investigation
  // ...
})
```

**Why this policy?**
- Flakes destroy confidence in the suite. Two flakes signal a real problem worth investigating synchronously.
- `test.fixme()` is explicit; skipping masks the problem.
- No `test.retry(N>1)` — that trades reliability for speed. Run-level retries stay at 1 (CI) / 0 (local).
- The tracking issue creates accountability for fixing the root cause.

**When to apply**: After the spec flakes a second time within the same calendar week (e.g., Monday and Wednesday), file an issue and apply `test.fixme()` in the same commit.

## CI-shape check

The suite is CI-ready: deterministic, headless, exits non-zero on failure, runs under 90s, and requires no `OPENAI_API_KEY`.

**Measured wall-clock: ~47s** (12 tests, 1 worker)
```
$ OPENAI_API_KEY= npm run test:e2e
12 passed (46.8s)
```

**Exit codes**:
- `0` on all-pass
- `1` on any failure

No GitHub Actions workflow is wired up yet; that's a follow-up.
