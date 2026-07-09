# Redesign v2 — review fix docs

Source: `/code-review` (medium) of `feat/redesign-v2` vs `main`, 2026-07-08. Eight
findings survived verification; the five below are the CONFIRMED, pre-merge ones.
Each has its own doc with root cause and an exact fix. The other three (theme
override altitude, theme-type duplication, `ageBadge` date math) are quality debt
and can ride a follow-up.

| # | Severity | Finding | Doc |
|---|---|---|---|
| 1 | High | "NOW" card shows a finished task all day | [01-nownext-stale-current.md](01-nownext-stale-current.md) |
| 2 | High | 8 refetches per checkbox click | [02-tasks-invalidation-storm.md](02-tasks-invalidation-storm.md) |
| 3 | High | `ai_question_asked` activation metric flatlined | [03-analytics-flatline-talk.md](03-analytics-flatline-talk.md) |
| 4 | Medium | Calorie-only day shows "No tasks scheduled" | [04-calorie-only-empty-state.md](04-calorie-only-empty-state.md) |
| 5 | Medium | Midnight snack renders at 6 AM | [05-calorie-hour-clamp.md](05-calorie-hour-clamp.md) |

All five are small, contained changes — none require rearchitecting. Suggested
order is 1 → 5 (severity), but they're independent and can land in any order or
one combined commit.

## Verified safe (investigated, not bugs)

- **Legacy accounts do not break on the new `theme` setting** — old settings rows
  store `{}` (key absent, not `null`), so the Zod `.default('midnight')` applies;
  the PATCH path 400s on `theme: null` before it could ever persist.
- **Malformed calorie times cannot silently drop entries** — strict `HH:mm` is
  enforced at three layers (two Zod regexes + a Postgres `TIME` column). Only the
  *placement* of valid out-of-range hours is wrong (finding 5).
