# HealthyFlow — Project Ledger

Auto-updated on every commit. Newest entries appear first.

- GitHub Issues: https://github.com/lermanori/HealthyFlow/issues
- Kanban: https://github.com/users/lermanori/projects/1/views/1

<!-- entries -->

### 2026-06-19 12:00 — `issue-8-timeline-ordering`

Fixed a critical bug (#8) where tasks with a `start_time` earlier in the day sorted after afternoon tasks when the afternoon task had an earlier `created_at`. The root cause was a broken comparator in `getTasksWithRecurringHabits`: when only one of the two tasks had a `start_time`, the sort fell through to `created_at` order, completely ignoring the timed task's time value. Extracted a pure `sortTasksForTimeline` helper (with 4 unit tests that reproduce the bug) and wired it into `supabase-client.ts`, replacing the broken inline sort. All 17 backend tests pass; frontend typechecks clean.

---

### 2026-06-19 00:00 — `issue-14-self-signup`

Implemented P0.2 self-signup (issue #14): added a public POST /api/auth/signup route with Zod validation, bcrypt hashing, and JWT response — reusing every existing auth helper. Rate limiting (5 req/IP/15 min via express-rate-limit) is scoped to that route only; admin /register is untouched and regression-tested. All 7 new TDD tests (new email, duplicate email, short password, bad email, rate limit, admin regression x2) pass alongside the 6 existing backend tests (13 total). Frontend LoginPage.tsx now toggles between "Sign in" and "Create account" with inline error surfacing for duplicate email.

---

### 2026-06-18 12:15 — `main`

Simplified the commit workflow: the post-commit hook has been stripped down to a no-op, and the agent now owns the ledger directly — writing a narrative entry to LEDGER.md before each commit so it lands in the same commit as the code. CLAUDE.md documents the new workflow clearly. The GitHub Wiki Home page is live and a sync Action is in place to keep the Ledger wiki page up to date on every push.

---

### 2026-06-18 11:49 — docs: add task tracking refs, ledger hook, and architecture rules to CLAUDE.md

- **Commit**: `5a34114` · branch `main`
- **Author**: Ori Lerman
- **Files changed** (4):
  - .githooks/post-commit
  - CLAUDE.md
  - CONTEXT.md
  - LEDGER.md

---

