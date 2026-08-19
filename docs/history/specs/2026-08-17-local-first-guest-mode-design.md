# Local-first guest mode

**Date:** 2026-08-17
**Status:** Approved design, not yet implemented
**Supersedes for launch:** the gated-beta funnel in `docs/superpowers/specs/2026-07-26-launch-prep-design.md`, and the "subscription for the product" pricing shape in `MARKETING.md`

## The product

> Free on your phone, forever, even offline. You pay only for the AI, or to have your day on more than one device.

Someone downloads the app and uses it. No account, no network, no price stands in front of the product. The first N devices receive $1 of AI credits so the AI can be tasted without committing to anything. An account exists for exactly two reasons: **buy more credits**, and **stop being confined to one device**.

Every reason to say no now sits *after* the moment of value rather than before it.

### What is being sold

| | Type | Notes |
|---|---|---|
| The app | Free, forever | Works offline, no account |
| AI credits | Consumable | 50 credits = $1 (`TOP_UP_PRICE_USD = 5` → `TOP_UP_CREDITS = 250`) |
| Cloud (backup, later sync) | Subscription | The second reason to hold an account |

This maps directly onto StoreKit's consumable and auto-renewable product types, which is an input to the still-open billing decision in [#201](https://github.com/lermanori/HealthyFlow/issues/201). It is **not** the model `MARKETING.md` currently describes; that document sells a subscription for the product itself and needs rewriting once this ships.

## Why this forces local-first

Four requirements were stated independently:

1. Value before signup
2. Data on the device until signup
3. Usable manually in guest mode indefinitely
4. Works offline, without AI

Three architectures were considered. Requirement 4 eliminates two of them:

| Option | Offline? | Verdict |
|---|---|---|
| Anonymous server account (a user row with no email) | ✗ still a server account | Cheapest by far, but dies on a plane |
| Local records, stateless server compute | ✗ needs a round trip per render | Keeps data local at rest, still fails offline |
| **True local-first** | ✓ | The only option satisfying all four |

There is nothing left to choose between. The requirement set is consistent and admits one architecture.

## Why this is smaller than it looks

`buildDaySummary` already takes every data source as an **injected dependency** — `getSettings`, `itemsForDay`, `getCalendarStatus`, `getCalendarEvents`, `getCalorieEntries`, `getWeightEntry`, `getWorkoutSessions`, `getAchievements`, `listDayFocusBlocks`. Each is a record fetch. Everything between them — capacity, attention, completion, week load, the fourteen daily-plan references — is pure, and the existing tests already drive it with fake dependencies.

So this is an **extraction and a second adapter**, not a rewrite.

| Category | Detail |
|---|---|
| Already pure, reusable as-is | `deriveCapacity`, `deriveAttention`, `deriveDateMode`, `unionIntervals`, `validateDailyPlacement`, `normalizeItemRows`, every schema in `day-summary-schema.ts` |
| Needs a boundary split | `day-summary.ts` imports `supabase-client`, `calendar`, `work`, `workouts`, `achievements` and `logger` at the top **only** to construct the default dependencies. The same split was already done for the Achievement and Workout contracts after the Vite development black screen, and a Chromium startup test guards that boundary |
| Genuinely new | Local implementations of the nine dependencies; a local write store; habit synthesis extracted out of `db.getTasksWithRecurringHabits`; guest identity; claim-at-signup |

`getItemsForDay` is three lines — a query, `Rollover.addCarryForwardRows`, and the pure `normalizeItemRows`. The rollover rule is deliberately tiny (ADR-0002). The habit synthesis currently living inside the database query is the one piece that must be separated from its fetch.

## Architecture

### The pure day core

Extract the assembly and derivations into a module the browser can import, leaving the server module as the composition root that supplies Supabase-backed dependencies. Both environments call the same `buildDaySummary` against the same contract, so a day rendered offline and a day rendered online are the same shape by construction, not by convention.

### Local store

Device-resident records for Items, Habits and Settings, implementing the same nine dependency functions plus writes (add, complete, drag, habit progress).

**Records are born sync-ready**, even though sync is out of scope:

- **Client-generated UUIDs.** If the server assigns ids at claim time, every local id changes on upload and a later sync has no stable identity to reconcile against. That would mean inventing a mapping table later to solve a problem that costs nothing to avoid now.
- **`updatedAt` on every record.**

This is the single decision that keeps "backup now, sync later" cheap.

### Guest identity and credits

Credits are keyed on `userId` throughout (`Credits.getBalance(userId)`, `db.getCreditBalance(userId)`). A guest has no user row, so:

- Issue a signed **guest token** carrying a `guestId`. `authenticateToken` learns a guest principal; every AI route already funnels through it, so metering does not move.
- A `guest_credit_grants` table keyed by device identity, with a **global cap held in a row, not a constant** — the same shape as `public_slots_open` / `public_slots_claimed` and `claimSignupCreditGrant` against `FOUNDING_MEMBER_LIMIT`. The cap is a cost-control dial to be raised when the economics are trusted, so it must be adjustable without a deploy.
- Grant size: **50 credits**, which is exactly $1 and exactly the existing `STANDARD_SIGNUP_CREDITS`. No new quantity is introduced; only the moment of granting changes.

**There is no download event.** The grant fires on first app open — "the first N devices that ask."

#### On device identity

Total exposure is N × $1, bounded by the counter rather than by identity. Device tracking therefore protects **fairness** (one person consuming every grant), not the budget. Ranked by what actually limits spend:

1. A global server-side spend cap — does not exist yet, and is the only control with a guaranteed worst case
2. A small grant, so identity failure costs cents
3. IP rate limiting — `express-rate-limit` is already used on signup, waitlist, account deletion and provider sessions
4. Device identity — stops the honest-but-curious, and nothing more

For the TestFlight phase, **TestFlight is itself the strongest gate**: installation requires an Apple ID and the public link, capped at 10,000 external testers. DeviceCheck — Apple's two-bits-per-device state that survives reinstall and factory reset — is the correct tool but is deferred until public App Store listing, when anyone can install. Keychain-backed UUID is the interim.

### Claim at signup

Guest is single-device by definition, so signup is a **one-time upload**, not sync. No conflict resolution, no merge strategy, no background sync. Remaining guest credits transfer to the new account. Multi-device sync is a later project against a real account, and keeping this a one-shot claim is the difference between a week and a quarter.

## Scope

**In:** Today, habits, rollover, capacity, attention, settings — offline, no account.

**Out, deliberately:**

- **Health (Nutrition, Workouts, Progress).** Roughly 2,650 lines with their own storage; adding four record types with local persistence roughly doubles the work. Requires an account, which also gives signup a second concrete reason.
- **Work.** Already hidden behind `VITE_WORK_ENABLED`.
- **Multi-device sync.** Backup only.
- **Offline AI.** Explicitly excluded.
- **Google Calendar, push, purchases.** Network by nature.

### A consequence worth noting

An offline guest has no Google Calendar by definition. Until `77b70e3`, that meant Capacity could only ever report *"at most X unallocated"* — because `calendar_not_connected` was pushed as a reason and `complete` requires an empty `reasonCodes` array. That change makes the offline guest see **"4h 10m usable time left"**, the exact sentence this launch rests on. It was a precondition for this design, not an unrelated fix.

This also reverses a documented limitation: `FEATURES.md` currently states the app is *"not offline-capable for data"*, which is accurate today and becomes the thing this fixes.

## Build order

1. **Split the pure day core** out of `day-summary.ts` so both environments import it. No behaviour change; provable against the existing 724 backend tests. De-risks everything after it and is worth doing on its own merits.
2. **Local store and local dependencies** for Items, Habits and Settings → Today works offline with no account.
3. **Guest token and device-keyed credit ledger**, capped, reusing the claim pattern.
4. **Claim-at-signup**: one-time upload, then transfer remaining credits.

## Open questions

- **Cloud subscription price and shape.** Not decided. Blocks nothing until step 4.
- **StoreKit vs. any web checkout.** [#201](https://github.com/lermanori/HealthyFlow/issues/201) remains unresolved; this design only narrows it by establishing that the products are a consumable and a subscription.
- **A global AI spend cap.** Does not exist. Should land before any unauthenticated or guest-authenticated AI call is reachable by strangers.
- **Whether guests may use Talk conversationally**, or only `parse-tasks`. Conversational chat is materially more expensive per interaction.

## Risks

- **The boundary regresses.** A browser import reaching a server-only module is exactly the Vite black screen that already happened once. The existing Chromium startup test is the guard and must cover the new module.
- **Two implementations drift.** Mitigated by both environments calling the same pure core against the same contract; the risk lives in the dependency adapters, not the assembly.
- **Local storage limits and eviction.** Browser storage can be evicted under pressure. Less of a concern in the Capacitor shell than on the web, but "forever" is a promise that needs a durable store chosen deliberately.
- **Habit synthesis divergence.** Extracting it from the database query is the subtlest part of step 2; it must produce identical instances to the server for the same inputs.
