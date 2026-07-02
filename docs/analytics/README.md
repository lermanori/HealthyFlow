# Product Telemetry — Developer Guide

How to work with the analytics layer. For *what* we track and *why*, read
[STRATEGY.md](./STRATEGY.md) first.

## Architecture

```
call sites (services, hooks, components)
        │  analytics.capture('event_name', { ... })   ← typed against AnalyticsEvents
        ▼
src/lib/analytics/index.ts      AnalyticsService (singleton `analytics`)
        │  provider-agnostic interface, no-op when disabled, never throws
        ▼
src/lib/analytics/posthogProvider.ts   the ONLY file that imports posthog-js
```

- **No file outside `src/lib/analytics/` may import `posthog-js`.** Migrating
  providers means writing a new `AnalyticsProvider` implementation and swapping
  it in `index.ts` — nothing else changes.
- Analytics is **fire-and-forget**: every service method is wrapped so a
  provider failure logs to console and does nothing else. The app must behave
  identically with analytics disabled.
- Do not confuse this with `analyticsService` in `src/services/api.ts` — that
  is the user-facing productivity-charts feature.

## Configuration

| Variable | Where | Meaning |
|---|---|---|
| `VITE_POSTHOG_KEY` | Netlify build env / `.env` | PostHog project API key. **Absent = analytics fully disabled** (local dev default). |
| `VITE_POSTHOG_HOST` | optional | Defaults to `https://us.i.posthog.com`. |

The static landing page (`public/landing.html`) can't read Vite env vars; its
snippet holds the key inline (empty = disabled). Keep it in sync with
`VITE_POSTHOG_KEY`. PostHog keys are public ingestion-only keys — safe in HTML.

Analytics also self-disables under `navigator.webdriver` (Playwright), so e2e
runs never send events.

## Event naming conventions

- **`snake_case`**, past tense, `object_verb`: `item_created`, `weight_logged`,
  `upgrade_request_sent`. Not `createItem`, not `Item Created`.
- Name the **user's accomplishment**, not the UI mechanics: `item_created`, not
  `add_button_clicked`. If a UI intent step matters for a funnel, suffix it
  `_cta_clicked` (`upgrade_cta_clicked`).
- Property keys are also `snake_case`. Enum-ish values are lowercase strings
  (`'ai_parse'`, `'text+photo'`).
- **Never put user content in properties** — no titles, meal names, question
  text. Types, categories, counts, and booleans only.

## Adding a new event

1. Justify it: which KPI, funnel, or decision reads from this event? If you
   can't name one, don't add it (see STRATEGY.md "not tracked" list).
2. Add it to `AnalyticsEvents` in `src/lib/analytics/types.ts` with its typed
   properties (`void` if none). This is the single source of truth; the
   compiler rejects unknown events and malformed properties.
3. Call `analytics.capture('your_event', { ... })` at the call site.
   **Prefer the service layer** (`src/services/api.ts`) — one capture there
   covers every UI path that uses the endpoint. Instrument components only for
   things the service can't see (CTA clicks, redirect landings, parse inputs).
4. Document the event with one table row in STRATEGY.md.

## User identification & properties

- `analytics.identify(userId, props, setOnce?)` is called from `AuthContext`
  on signup, login, and token verification; `analytics.reset()` on logout.
- Person properties are typed in `UserProperties` (`types.ts`):
  `email`, `name`, `role`, `is_demo`, `onboarding_status`,
  `subscription_active`, `credit_balance_bucket`; plus set-once
  `signed_up_at`.
- `analytics.setUserProperties()` deduplicates — it only sends keys whose
  values changed this session, so it's safe to call from frequently-run code
  (e.g. the credit-summary fetch syncs `subscription_active` on every load).
- Add new properties to the `UserProperties` type first, same rule as events.

## Feature flags

```tsx
import { useFeatureFlag } from '../lib/analytics/useFeatureFlag'

const showNewPaywall = useFeatureFlag('new-paywall-copy', false)
```

- The second argument is the fallback used until flags load **and** whenever
  analytics is disabled — flag-gated UI must always have a working default.
- Outside React, use `analytics.isFeatureEnabled(flag)` (returns `false` when
  unknown/unavailable).
- Create flags in PostHog with kebab-case names; delete them from code and
  PostHog once an experiment concludes.

## Session recordings

Enabled via PostHog project settings; the client config sets `maskAllInputs`
so no typed text is recorded. Don't add `ph-no-capture` exceptions that would
expose user content.

## Pageviews

Autocapture is off. `PageViewTracker` (mounted in `main.tsx`) sends a manual
`$pageview` on every route change. New routes need no extra work.

## Dashboards (PostHog)

Four dashboards, mirroring the funnel — see STRATEGY.md for their exact
insight definitions:

1. **Acquisition** — landing traffic, UTM/referrer, visitor→signup.
2. **Activation & Onboarding** — signup→onboarding funnel, activation rate.
3. **Engagement & Retention** — DAU/WAU, cohorts, module usage, AI acceptance.
4. **Monetization** — credits-exhausted→upgrade funnel, subscriber counts.

Every insight filters `is_demo = false` and `role != admin`. When adding a
dashboard, keep one dashboard per funnel stage rather than per feature.
