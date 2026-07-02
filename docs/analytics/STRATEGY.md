# HealthyFlow Analytics Strategy

Status: adopted — 2026-07-02
Platform: PostHog Cloud (free tier), behind a provider-agnostic `AnalyticsService` (`src/lib/analytics/`).

## Why this document exists

Before public launch we need to answer, with data instead of intuition: where users come from, where they abandon onboarding, what actions predict retention, which features are used, and how visitors become active users and active users become paying customers. This document defines the smallest event set that answers those questions.

Naming note: the codebase already has an "analytics" concept — `backend/src/routes/analytics.ts` and `analyticsService` in `src/services/api.ts` — which is the **user-facing productivity charts** feature. This document is about **product telemetry** (how people use HealthyFlow). The telemetry layer lives in `src/lib/analytics/` and is the only thing that talks to PostHog.

## The user journey

```
Landing (public/landing.html, static)
  │  "Start Free" CTA → /
  ▼
Login / Signup (LoginPage)
  │  demo account is prominent → many "visitors" are demo sessions, must be segmentable
  ▼
Onboarding (seeded on signup: 3 starter tasks + checklist card on Today)
  │  explicit terminal states: completed | skipped (onboardingStatus in settings)
  ▼
Core loop (Today page)
  │  add items (manual or AI parse) → schedule/drag → complete → repeat daily
  │  side loops: calories/weight, workouts, achievements, week view
  ▼
AI value moment (credit-metered)
  │  parse-tasks / parse-meals / Ask AI — every call burns credits
  ▼
Monetization (Settings page)
     low/out-of-credits banner → subscribe or top-up intent → contact message
     → admin activates subscription in Token Manager (human-in-the-loop, no Stripe)
```

### Activation definition

A user is **activated** when, within their first 3 days, they have **created at least 1 item and completed at least 1 item**. The hypothesis to verify with this data: users who experience "add → complete" once come back; users who only look, don't. AI usage (`ai_parse_requested` or `ai_question_asked`) is the secondary activation signal — it's the differentiated value moment and the on-ramp to monetization.

### Engagement loops

1. **Daily planning loop** — open Today, add/complete items. Measured by `item_created` / `item_completed` per user per day.
2. **AI capture loop** — dump a paragraph/photo, accept parsed items. Measured by `ai_parse_requested` → `item_created(source: ai_parse)` acceptance rate.
3. **Health logging loops** — calories/weight/workouts/achievements. Measured by their `*_logged` events; these tell us which modules create value (and which to cut).

### Monetization funnel

`credits_exhausted` (hit the wall) → `upgrade_cta_clicked` (opened intent) → `upgrade_request_sent` (contact message created — the conversion event we control) → subscriber (user property, set from credit summary once admin activates).

## Events we track

The rule for inclusion: an event earns its place only if a named KPI or funnel step reads from it. Everything else is noise.

### Lifecycle & identity

| Event | Fired when | Why it matters |
|---|---|---|
| `$pageview` (manual, via router) | route change | feature usage by surface; entry points; DAU basis |
| `signed_up` | signup succeeds | top of registered funnel; cohort anchor |
| `logged_in` | login succeeds (`is_demo` prop) | return visits; demo-vs-real segmentation |
| `onboarding_completed` | user clicks Finish | onboarding conversion numerator |
| `onboarding_skipped` | user clicks Skip | distinguishes "rejected onboarding" from "abandoned app" |

### Core loop

| Event | Properties | Why |
|---|---|---|
| `item_created` | `item_type`, `category`, `source` (`manual`/`ai_parse`), `has_start_time`, `repeat` | the core input action; `source` gives AI-parse acceptance; retention correlate |
| `item_completed` | `item_type`, `category` | the core value action; activation & retention correlate |

Captured at the `taskService` layer so every UI path (Today, Week, timeline) is covered by one call site each.

### AI (value moment + credit burn)

| Event | Properties | Why |
|---|---|---|
| `ai_parse_requested` | `surface` (`tasks`/`meals`), `input` (`text`/`photo`/`text+photo`), `succeeded`, `item_count` | usage of the flagship feature; failure rate; funnel into acceptance |
| `ai_question_asked` | — | Ask-AI engagement |

AI-parse **acceptance** is derived, not a separate event: `item_created(source: ai_parse)` / `calorie_entry_logged(source: ai_parse)` following a parse.

### Modules (which features create value)

| Event | Properties | Why |
|---|---|---|
| `calorie_entry_logged` | `source` (`manual`/`ai_parse`) | calories module usage |
| `weight_logged` | — | weight module usage |
| `workout_logged` | — | workouts module usage |
| `achievement_recorded` | — | achievements module usage |
| `google_calendar_connected` | — | integration adoption (a likely retention driver) |
| `pwa_installed` | — | strongest commitment signal we have pre-payment |

### Monetization

| Event | Properties | Why |
|---|---|---|
| `credits_exhausted` | — | paywall moment (once per session); denominator for upgrade conversion |
| `upgrade_cta_clicked` | `kind` (`subscribe`/`topup`) | intent opened |
| `upgrade_request_sent` | `kind` | conversion event (contact message created) |

Subscription **activation** is admin-performed (Token Manager), so "is paying" is a **user property** (`subscription_active`, refreshed from the credit summary), not a client event. When Stripe replaces the manual flow, `subscription_activated` becomes a server-side event.

## User identification & properties

- `identify(userId)` on login/signup/token-verify; `reset()` on logout. Anonymous landing/login traffic merges into the identified profile automatically (PostHog alias-on-identify).
- Person properties: `email`, `name`, `role`, `is_demo`, `signed_up_at` (set once), `onboarding_status`, `subscription_active`, `credit_balance_bucket` (`none`/`low`/`ok` — bucketed, not exact, to avoid property churn).
- The demo account (`demo@healthyflow.com`) is tagged `is_demo: true`; every dashboard filters it out by default.

## KPIs derivable from this set

| Question | Derivation |
|---|---|
| Where do users come from? | UTM/referrer on landing + first `$pageview` (PostHog captures these automatically) |
| Visitor → signup conversion | landing `$pageview` → `signed_up` funnel |
| Onboarding abandonment | `signed_up` → (`onboarding_completed` \| `onboarding_skipped`) funnel; the gap is abandonment |
| Activation rate | `signed_up` → `item_created` → `item_completed` within 3 days |
| Retention & its correlates | week-N retention cohorts on `item_completed`; correlate with `ai_parse_requested`, `pwa_installed`, `google_calendar_connected` |
| Feature/module usage | counts of module events + `$pageview` by path |
| AI-parse acceptance rate | `ai_parse_requested` → `item_created(source: ai_parse)` |
| Active → paying conversion | `credits_exhausted` → `upgrade_cta_clicked` → `upgrade_request_sent` funnel; `subscription_active` property for the final step |
| Impact of changes | all of the above split by feature-flag variant or release date |

## What we deliberately do NOT track

- **Autocapture** (every click/rageclick): off. It floods the event stream, breaks the typed catalog, and free-tier volume is better spent on session recordings.
- **Edits, deletes, reorders, drags, date navigation**: mechanics, not value moments. Session recordings cover "how people manipulate the timeline" better than events could.
- **Item titles, calorie names, question text, or any user content**: privacy. Events carry types/categories/counts only. Session recordings mask all input text.
- **Uncomplete/undo actions**: noise; net completion is what retention reads from.
- **Admin surfaces** (Token Manager, Meal Parser Lab): operator tooling, not product usage. Admin role is a person property, so admin activity can be filtered out anyway.
- **Server-side AI token/cost accounting**: already first-class in the credits system (Postgres); duplicating it into PostHog adds a second source of truth that will drift. Revenue/cost dashboards read from the database.
- **Errors/performance**: that's monitoring, not product analytics — belongs in a logging/APM tool, not PostHog events.

## Session recordings & feature flags

- **Recordings**: enabled at 100% while user volume is tiny (free tier: 5k recordings/mo), with `maskAllInputs` on. Primary use: watch onboarding sessions and first AI-parse attempts. Revisit sampling at ~500 MAU.
- **Feature flags**: exposed through `analytics.isFeatureEnabled(flag)` / `useFeatureFlag(flag)` so experiments (e.g. onboarding variants, paywall copy) can be measured against the funnels above. Flags degrade to `false`/default when PostHog is unreachable.

## Dashboard organization (PostHog)

1. **Acquisition** — landing pageviews by UTM/referrer, visitor→signup funnel.
2. **Activation & Onboarding** — signup→onboarding funnel, activation rate, time-to-first-completion.
3. **Engagement & Retention** — DAU/WAU, retention cohorts, module usage breakdown, AI acceptance rate.
4. **Monetization** — credits-exhausted → request-sent funnel, subscriber count, conversion by cohort.

All dashboards filter `is_demo = false` and `role != admin`.
