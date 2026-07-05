# HealthyFlow product packaging — design

**Date:** 2026-07-05
**Status:** Approved by founder
**Context:** The app felt "messy — no clear story." This design names the unifying thesis and derives the story, audience, product shape, and onboarding from it. It feeds the 10-customer plan in `MARKETING.md`.

## Thesis

**Every other app's unit is a thing — a task, a meal, a streak, a workout. HealthyFlow's unit is the day.**

Work, food, training, weight, and habits all happen inside the same 24 hours; the app market split them into five silos. HealthyFlow refuses the split. Every existing mechanism is an expression of this thesis:

- The timeline is a day, not a list.
- Rollover exists because days are connected — yesterday flows into today.
- Habit instances are per-day materializations (the architecture itself is day-centric).
- Calorie and weight entries are facts about a day.
- The AI brain-dump works because a day arrives as one messy stream; only a day-centric app can catch all of it in one input.
- The name — Healthy**Flow** — is days flowing into each other.

This dissolves the earlier "story A (whole day) vs story B (brain-dump)" tension: brain-dump is how a day starts, the timeline is how it's lived, rollover is how it ends. One story, three moments.

## Story (external)

- **One-liner:** "Your whole day in one place. Tasks, food, training, weight — one timeline that rolls itself forward."
- **Pitch (DM / landing, 3 sentences):** "You live one day, but you track it across five apps — a to-do list, a habit tracker, a calorie counter, a scale app, a workout log. HealthyFlow puts the whole day on one timeline. Type it in plain words — 'gym at 6, eggs for breakfast, finish the report' — and it lands in the right places; whatever you don't finish rolls into tomorrow by itself."
- The AI brain-dump is the opening move of the story, not the identity. The identity is the day.

## Audience

First payers: **busy people juggling work + gym + diet** — the founder's own profile, reachable via warm network. Grounding: the founder's validated daily loop is timeline+rollover and calories+weight (not the AI dump). The ADHD/overwhelmed angle remains a message variant to test in communities later; the product identity does not depend on it.

## Product shape

The razor for every feature: **does it live on the day?**

| Action | What | Why |
|---|---|---|
| **Keep & polish** | Today timeline (hero screen), rollover, habits, calories + weight, AI capture, week view | The validated core; all day-shaped |
| **Promote** | Calories/weight: currently gated behind the `calorieIntake` user setting → becomes **on by default**; timeline shows body items alongside plans | It's half the story; can't hide half the story |
| **Merge** | One AI surface, not two (Ask vs Assistant — issue #124) | One day, one conversation about it |
| **Hide until wired** | Grocery, meal, workout item types | Half-built surfaces read as mess; sell the unified model only when real |
| **Cut from the story** | Expenses (#97), ideas dump (#96) | Not day-shaped — the source of the "unfocused" feeling. May exist later as satellites; never in marketing or onboarding |

## Onboarding = the aha

New user's first screen asks one thing: **"Tell me about your day tomorrow — work, food, gym, anything."** One brain-dump → the timeline appears populated with both plans and body items. Demonstrates the entire thesis in ~30 seconds. The same moment is the demo GIF for community posts and the hero of the landing page. Trial credits (MARKETING.md fix-list P0 #2) exist to power exactly this.

## Unchanged

Pricing ($1/mo founding member, sell-rate split fix, manual fulfillment), the 10-customer outreach plan, and the P0/P1 fix list in `MARKETING.md` all stand. This design replaces the planned story-A/B test with one committed story and adds three product-shape work items (calories on by default; single AI surface; hide unwired item types).

## Implementation notes (for the plan that follows)

- Calorie gate: see issue #47 / the `calorieIntake` setting — flip default, keep opt-out.
- AI surface consolidation: start from issue #124's comparison.
- Hiding item types: feature-flag the UI surfaces; do not delete backend code.
- Onboarding rework builds on the shipped post-signup flow (#106) — change the first prompt to the single brain-dump question.
- Landing page (`public/landing.html`): rewrite hero to the one-liner + pitch; regenerate screenshots via the demo-account + Playwright flow.
