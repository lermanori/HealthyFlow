# UX review — dated findings, not current state

A point-in-time UX/UI review conducted on **18 July 2026** against a local build
using the Lina demo persona. No production UI was changed by the review itself.

**Read these as evidence and reasoning, not as a live defect list.** Several
findings have since been fixed, and the documents were never updated to say so.
Verify any finding against the code before acting on it.

| File | What it is |
|---|---|
| [`HEALTHYFLOW_UX_UI_REVIEW.md`](./HEALTHYFLOW_UX_UI_REVIEW.md) | The full review: method, viewports, heuristics, accessibility and visual analysis |
| [`UX_FINDINGS.md`](./UX_FINDINGS.md) | The findings table (`HF-001`…) with evidence, severity, effort and relevant files |
| [`UX_QUICK_WINS.md`](./UX_QUICK_WINS.md) | The subset judged Small/Medium effort |
| [`UX_STRUCTURAL_REDESIGNS.md`](./UX_STRUCTURAL_REDESIGNS.md) | Structural proposals — recommendations, never implemented as written |
| `screenshots/` | Captures referenced by the findings |

## Known-stale examples

Two of the High findings appear resolved in current code:

- **HF-001** (enabled health routes redirect to Today while settings load) —
  `ModuleGate` in `src/App.tsx` now has an explicit `loading` branch that renders
  a spinner and stays on the requested route, rather than redirecting before
  settings resolve. `disabled` produces a redirect carrying an explanatory
  `moduleNotice` instead of a silent bounce.
- **HF-002** (Add exposes Calories and Achievements for disabled modules) —
  `src/pages/AddItemPage.tsx` now resolves `calorieAvailability`,
  `workoutAvailability` and `achievementAvailability` from `useSettings`.

These two are called out because they are the ones verified while auditing the
docs. **The rest have not been re-checked** — absence from this list means
unknown, not unfixed.

For what the app actually does today, see root
[`FEATURES.md`](../../FEATURES.md) and [`CONTEXT.md`](../../CONTEXT.md).
