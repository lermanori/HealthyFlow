# HealthyFlow

Personal productivity / habit tracker. React + Vite frontend, Express + TypeScript backend, Supabase (Postgres) for data, deployed on Railway. The same frontend also ships as a native iOS app through a Capacitor shell.

## Stack

- **Frontend**: React 18 + Vite, TypeScript, Tailwind CSS — deployed on Netlify
- **iOS**: Capacitor shell in `ios/` (app id `app.healthyflow.mobile`) wrapping the same React app. Note the app target's two build configurations declare different `IPHONEOS_DEPLOYMENT_TARGET` values (15.0 and 17.0) while the widget is 17.0 in both — confirm the intended floor before relying on an OS-gated API. Native plugins for Sign in with Apple, Google sign-in, push, haptics and a WidgetKit Today widget. Currently distributed via **TestFlight**; not publicly listed on the App Store. Changes to the web app change the iOS app — check both before assuming a frontend change is web-only.
- **Backend**: Express + TypeScript — deployed on Railway
- **Database**: Supabase (Postgres)
- **AI**: OpenAI API, server-keyed only (no BYOK)

## Architecture decisions

### Deep modules
Business logic lives in a small number of fat service files rather than many thin ones. Key modules:
- `day-summary-schema.ts` — **the day contract**, and the most central type in the codebase. A versioned (`version: 1`) description of everything a day holds: the ordered daily plan of fourteen reference kinds tagged `plan` / `actual` / `boundary`, plus capacity, attention, completion, week load and per-module summaries. Read it before changing anything that appears on Today. Modules own their records; the day only references them.
- `openai.ts` — all AI calls, prompt construction, structured output parsing
- `rollover.ts` — all rollover logic (carrying incomplete untimed items across days). Intentionally small: per ADR-0002 this collapsed to a single carry-forward rule, so a thin file here is by design, not missing logic.

Add logic to existing deep modules rather than creating new files for each feature.

### Zod as single source of truth
All data shapes are defined as Zod schemas. TypeScript types are derived from schemas (`z.infer<>`), not written separately. Validators, API response shapes, and AI output contracts all reference the same Zod definitions.

### Virtual-first data (habit instances)
Habit instances are synthesized at query time from the parent habit record — they are not written to the database until the user completes one **or drags the instance** (to set a per-day time or position override). This avoids pre-populating rows for every future day. When a habit is completed or dragged into a time slot / the Anytime backlog, a real row is written (with `original_habit_id` set); otherwise the instance is computed on the fly. See `docs/adr/0001-materialize-habit-instance-on-drag.md` for the drag-materialization decision.

### Thin routes
Express route handlers do minimal work: validate the request (Zod), call a service function, return the result. Business logic belongs in service modules, not in route files.

## AI harness rules

- **Server-keyed only**: the OpenAI API key lives on the server. There is no BYOK flow. Do not add client-side key handling.
- **No silent fallbacks**: if an AI call fails, surface the error to the caller. Do not fall back to a hard-coded response or empty result without signalling failure.
- **callStructured interface**: AI calls use `callStructured(schema, prompt) → Result<T>`. The caller gets a typed `Result<T>` — either a value or an explicit error — never an untyped `any`.

## Task tracking

- **GitHub Issues**: https://github.com/lermanori/HealthyFlow/issues
- **GitHub Project (kanban)**: https://github.com/users/lermanori/projects/1/views/1
- At the start of any AI session, check the kanban board for current task state before acting. Issues are the source of truth for what's in progress and what's next.
- **Project Ledger**: `LEDGER.md` at the repo root is a hand-written session narrative, newest entries first. The agent prepends an entry as part of the commit workflow below — it is **not** automated by a git hook. (`.githooks/post-commit` exists but is deliberately a no-op.)

## Domain vocabulary

See `CONTEXT.md` at the repo root for the canonical definition of all domain terms (Item, Task, Habit, Rollover, Habit instance, Daily Plan reference, Capacity, Planning window, parse-tasks, etc.). Use the vocabulary there consistently; do not introduce synonyms. "BYOK" is retired vocabulary — see the Server-keyed entry.

## Repo map

Root-level docs and what each is authoritative for. If it is not listed here, it is not a source of truth.

| File | Authoritative for | Status |
|---|---|---|
| `CLAUDE.md` | Agent instructions for this repo | Live. `AGENTS.md` is a symlink to it — edit `CLAUDE.md` only. |
| `CONTEXT.md` | Domain vocabulary | Live |
| `docs/adr/` | Architecture decisions, numbered | Live |
| `docs/agents/` | Skill configuration (issue tracker, triage labels, domain layout) | Live |
| `docs/ios.md` | The iOS app: Capacitor shell, native plugins, widget, signing, APNs, version gate, release order | Live — authoritative for anything native |
| `LEDGER.md` | Session-by-session narrative history | Live, append-only |
| `FEATURES.md` | What the app actually does today | Live — carries a "last verified against the code" date; re-verify before trusting it |
| `MARKETING.md` | Positioning, pricing, go-to-market plan | Live, product-side — not a spec for code |
| `MISSION.md`, `RESOURCES.md` | The Siri Capture workstream only | Narrow scope; do not read as whole-project mission |
| `README.md`, `README-DEPLOYMENT.md` | Setup and deploy steps | Live |
| `ROLLOVER_IMPROVEMENTS.md` | — | **Superseded** by ADR-0002. Historical only; do not implement from it. |

Untracked working directories that may exist locally and are not part of the repo: `.agents/` (skills installer drop), `.board-harness/` (local board-driven agent orchestration), `.scratch/` (throwaway notes).

## Agent commit workflow

When the user says "commit" (with or without a message), the agent should:

1. Run `git status` to see what has changed.
2. Write a concise commit message in the form `<type>: <summary>` (e.g. `feat:`, `fix:`, `docs:`, `refactor:`). Use the user's words if they supplied a message.
3. Prepend a new entry to `LEDGER.md` using this format:

```
### YYYY-MM-DD HH:MM — `<branch>`

<2–4 sentence human-readable narrative of what was accomplished this session and where the project stands. Not a copy of the commit message — write it as a status update.>

---
```

4. Stage all changed files plus `LEDGER.md` with `git add`.
5. Run `git commit -m "<message>"`.

## Agent skills

### Issue tracker

GitHub Issues + the GitHub Project (kanban) are the single source of truth. Publish issues to the repo and add them to Project 1; record triage/workflow state via the project's `Status` field, not a file. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical roles (no overrides): `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at repo root. Frontend and backend share vocabulary. See `docs/agents/domain.md`.
