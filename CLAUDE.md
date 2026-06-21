# HealthyFlow

Personal productivity / habit tracker. React + Vite frontend, Express + TypeScript backend, Supabase (Postgres) for data, deployed on Railway.

## Stack

- **Frontend**: React 18 + Vite, TypeScript, Tailwind CSS — deployed on Netlify
- **Backend**: Express + TypeScript — deployed on Railway
- **Database**: Supabase (Postgres)
- **AI**: OpenAI API, server-keyed only (no BYOK)

## Architecture decisions

### Deep modules
Business logic lives in a small number of fat service files rather than many thin ones. Key modules:
- `openai.ts` — all AI calls, prompt construction, structured output parsing
- `rollover.ts` — all rollover logic (carrying incomplete items across days)

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
- **Project Ledger**: `LEDGER.md` at the repo root is auto-updated on every commit (via `.githooks/post-commit`). It records commit message, branch, author, and files changed — newest entries first. New clones must run `git config core.hooksPath .githooks` once to activate it.

## Domain vocabulary

See `CONTEXT.md` at the repo root for the canonical definition of all domain terms (Item, Task, Habit, Rollover, Habit instance, parse-tasks, BYOK, etc.). Use the vocabulary there consistently; do not introduce synonyms.

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

Local markdown under `.scratch/<feature-slug>/`. No GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical roles (no overrides): `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at repo root. Frontend and backend share vocabulary. See `docs/agents/domain.md`.
