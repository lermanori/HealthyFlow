# Health on the device

**Date:** 2026-08-21
**Status:** Approved design, not yet implemented
**Scope:** Piece 2 of 3. Piece 1 (Claim) is built; piece 3 (Sign in) depends on this.

## The problem

`TARGET.md` says food, weight and training are **core, not optional**, and that no
part of the day is withheld. A Guest's day reports Nutrition, Weight, Training and
Progress as `disabled`, because the device holds none of those records. ADR-0011
records the contradiction and does not resolve it. This resolves it.

It is also piece 3's blocker: signing in downloads an account's day, and until the
device can hold health records the download has nowhere to put them.

## Decision: health records are stored client-shaped

Items are stored in the server's snake_case column shape, because
`itemRowToClient` and `composeDayTaskRows` consume rows. **Health is stored in the
client shape instead** — `CalorieEntry`, `WeightEntry`, `WorkoutSession`,
`AchievementDefinition`, `AchievementEntry` exactly as `src/services/api.ts`
returns them.

Three reasons, and they all point the same way:

- The four health services return client shapes, so the local implementations
  return what they hold, with no mapping layer to write or to get wrong.
- The day core already takes client shapes here: it spreads workout sessions
  directly, and reads `summary.definition` / `summary.entries` off achievements.
- `calorieRowToClient` and `weightRowToClient` were already written
  shape-agnostic — `row.weight_kg ?? row.weightKg`, `row.created_at ??
  row.createdAt` — so they accept client shapes unchanged.

The asymmetry with Items is deliberate and worth stating: **each side stores
whatever shape its consumers already speak.** The cost lands in piece 3, where
`buildAccountExport` returns snake_case and one mapping is needed on the way in.
That mapping is unavoidable either way, because the export is the server's shape.

Nesting follows the client shape too: a `WorkoutSession` holds its `exercises`
inline and a `WorkoutPlan` holds its own, so two arrays disappear that the server
needs as separate tables.

## What the document gains

```
calorieEntries         CalorieEntry[]
calorieItems           CalorieItem[]            // the logging autocomplete
weightEntries          WeightEntry[]
workoutSessions        WorkoutSession[]         // exercises nested
workoutPlans           WorkoutPlan[]            // exercises nested
workoutExerciseItems   WorkoutExerciseItem[]    // the logging autocomplete
achievementDefinitions AchievementDefinition[]
achievementEntries     AchievementEntry[]
```

The document version goes to **2**. A version the code does not recognise already
throws rather than being treated as an empty day, so a downgrade is loud. Upgrading
1 → 2 adds the eight empty arrays, because a version-1 document is a valid
version-2 document with no health in it.

## One rule, one implementation

`summarizeAchievement` derives `latest`, `previous`, `personalBest`, `trend` and
`targetProgress` from a definition and its entries. It is already pure and already
exported, but it lives in `achievements.ts`, which imports the database.

It moves to `achievement-contracts.ts`, which is browser-safe and which
`achievements.ts` already re-exports wholesale — so no call site changes. Its two
row mappers learn to accept camelCase as well as snake_case, the same way
`calorieRowToClient` already does, so one implementation serves both sides.

This is the third time this pattern has paid: `composeDayTaskRows`,
`deriveHabitOutcome`, and now this. **A rule that both sides need goes in
`*-contracts.ts`; only the fetch stays behind.**

## The four day sources stop throwing

`localDaySummaryDependencies` currently throws for Nutrition, Weight, Training and
Progress, because an empty result would claim the user logged nothing. They now
answer from the document, and the local settings baseline stops switching those
modules off — so a Guest's day reports them like anyone else's.

`getAchievements` composes summaries through the shared `summarizeAchievement`,
honouring `includeArchived` and `entryLimit` as the server does.

## What routes to the device

`caloriesService`, `weightService`, `workoutsService` and `achievementService` gain
`onDevice` branches on every method **except one**:

**`workoutsService.generatePlan` stays hosted.** It is an AI call: server-keyed,
credit-metered, and impossible offline by nature. That is not a gap — it is the
same boundary Talk and parse-tasks already sit on, and `TARGET.md` exempts AI from
the offline refusal explicitly.

## Testing

The existing `src/lib/local/day.test.ts` covers Items through the memory driver;
health gets the same treatment in a sibling file. What is worth asserting:

- A Guest's day reports Nutrition, Training and Progress as **enabled** rather
  than `disabled` — the assertion that this piece did its job.
- Logging a calorie entry, a weight, a workout session and an achievement entry
  each appear on the day they belong to, and not on neighbouring days.
- `summarizeAchievement` produces the same summary from client-shaped records as
  from server rows — the guard against the two sides drifting.
- A failed read still throws rather than reporting an empty day.

## Documentation consequences

- **ADR-0011's "consequence that is not resolved"** is superseded. A new ADR is
  not needed — this is the closure that ADR already names, not a new decision.
- `TARGET.md`'s refusal gains back the half it lost: the only remaining gap in
  *never require a network* becomes an account holder's day still being hosted,
  which is piece 3.
- `CONTEXT.md` — remove "Health for a Guest" from things that look built and are
  not; update **Local day** to say what it holds.
