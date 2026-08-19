# Proactivity, notifications and future planning — design

**Issue**: [#133](https://github.com/lermanori/HealthyFlow/issues/133)
**Date**: 2026-07-09
**Status**: Approved (brainstorm with owner)

## Vision

HealthyFlow currently only reacts when opened. This feature gives it a **rhythm**:
three recurring planning touchpoints that reach the user via real push
notifications on their iPhone and land in the assistant, pre-seeded with the
right context.

- **Morning planning** — shape today.
- **Mid-day update** — adjust course.
- **Weekly planning** — place work onto future days.

The rhythm is seeded during onboarding, editable in Settings, and (in a later
slice) gently auto-tuned from observed behavior — suggestions only, never
silent changes.

"Future planning" requires **no data-model work**: per ADR-0002, a task with a
future `scheduled_date` already stays in the future, and Week view already
renders it. The weekly-planning kickoff is a UX entry point onto the existing
model.

## Decisions made

| Question | Decision |
|---|---|
| Delivery channel | Web Push to iPhone PWA (home-screen install required, iOS 16.4+) |
| Infrastructure | Web Push + `node-cron` in the existing Railway Express process (Approach A; Supabase pg_cron and Capacitor rejected for v1) |
| Notification content | Static deterministic text; AI runs when the user opens the kickoff, never at send time |
| Landing | Assistant, pre-seeded per touchpoint (`/assistant?kickoff=<type>`) |
| Adaptivity | Onboarding seeds + Settings edits + deterministic auto-tune *suggestions* (rule thresholds, not AI) |
| Credits | Kickoff conversation costs credits like any assistant chat; sending pushes costs nothing |

## Data model (Zod-first)

**`user_rhythm`** — one row per user:

- `morning_planning`: `{ enabled: boolean, time: "HH:MM", days: number[] }`
- `midday_update`: `{ enabled: boolean, time: "HH:MM", days: number[] }`
- `weekly_planning`: `{ enabled: boolean, time: "HH:MM", day: number }`
- `timezone`: IANA string, captured from the client
- `last_sent` per touchpoint (idempotency; missed ticks are skipped, not
  caught up)

Day numbers use `0 = Sunday … 6 = Saturday` throughout.

Defaults for every field so the feature works before onboarding runs.
Touchpoint types are a **closed set**: `morning | midday | weekly`. There is no
separate notification-preferences concept — the rhythm row *is* the
preferences.

**`push_subscriptions`** — `user_id`, endpoint, keys, `created_at`,
`last_seen_at`. Multiple rows per user (phone + desktop). A `410 Gone` on send
deletes the row.

## Delivery pipeline

All backend logic in **one deep module `backend/src/proactivity.ts`**; routes
stay thin.

- **Scheduler**: `node-cron` tick every 5 minutes → `findDueTouchpoints(now)`
  selects touchpoints whose user-local time has arrived and whose `last_sent`
  isn't today (this week, for weekly). `last_sent` is written **before**
  sending: a crash mid-send skips a nudge, never doubles one.
- **Sender**: `web-push` npm lib, VAPID keys in Railway env vars. Static
  payload per type, e.g. morning: "Good morning ☀️ Ready to plan your day?" →
  `/assistant?kickoff=morning`.
- **Routes**: `POST /push/subscribe`, `DELETE /push/subscribe`,
  `GET /rhythm`, `PUT /rhythm`.
- **Service worker**: `push` → `showNotification`; `notificationclick` →
  focus-or-open the kickoff URL. On every app open the client verifies its
  subscription is still live (iOS silently expires them) and re-subscribes.

**Failure behavior**: send failures logged; `410` prunes the subscription;
process downtime at tick time skips that touchpoint. No retry queue in v1.

## Assistant kickoffs

`/assistant?kickoff=<type>` triggers a server-built first message using the
touchpoint prompt + existing daily-context. Existing write-tools handle all
actions ("move to tomorrow", "schedule gym Thursday") — no new capabilities.

- **Morning**: today's timed items, rollovers, calorie/workout goal status →
  proposes a shape for the day, offers to timebox the backlog.
- **Mid-day**: done vs. remaining, hours left → offers to re-plan the rest of
  the day (defer / reorder / drop).
- **Weekly**: coming week's scheduled items + incomplete backlog + habit
  cadence → helps place tasks onto future days via plain `scheduled_date`
  writes.

If the AI call fails, the assistant shows its normal error state — no fake
briefing (no-silent-fallbacks). Opening a kickoff records that touchpoint as
**engaged** (feeds auto-tuning).

## Onboarding + Settings

- Onboarding (#134) gains one step: 2–3 seed questions (morning time; weekly
  planning day/time; mid-day check-in yes/no) → writes `user_rhythm`, then the
  add-to-home-screen walkthrough + notification permission prompt (iOS
  requires install before permission can be requested).
- Settings gains a **Rhythm** section: per-touchpoint toggle, time picker, day
  picker(s) — direct edits of the same row — plus a **Send test notification**
  button (the only practical way to debug iOS push).

## Gentle auto-tuning (slice 3)

Nightly job in `proactivity.ts` computes per-touchpoint engagement over a
trailing window (sent vs. opened; typical first-app-open time from existing
analytics). Deterministic threshold rules — not AI — produce at most **one
pending suggestion**, shown as a card in the next morning kickoff, e.g. "You
usually start at 6:45 — move your morning brief?".

- **Yes** → normal `PUT /rhythm` write.
- **No** → that rule muted for 30 days.
- Never auto-applies.

Initial rules: (1) touchpoint ignored 10 consecutive sends → suggest disabling
or moving it; (2) first app open consistently ≥45 min before the morning brief
→ suggest earlier time.

## Testing

- Unit: `findDueTouchpoints` (timezone edges, DST, `last_sent` idempotency,
  weekly-day matching); auto-tune rules.
- Integration: subscribe/rhythm routes; kickoff prompt tests mirroring
  `assistant-chat.test.ts`.
- `web-push` mocked in tests; real-device iOS verification via the Settings
  test button.

## Phasing (each slice → its own issue)

1. **Pipe end-to-end**: `push_subscriptions`, service worker, subscribe flow,
   VAPID setup, cron tick, `user_rhythm` with defaults, morning touchpoint +
   morning kickoff, Settings test button.
2. **Full rhythm**: mid-day + weekly touchpoints and kickoffs, Settings Rhythm
   section, onboarding seed step (coordinates with #134).
3. **Auto-tuning**: engagement tracking, nightly rules job, suggestion card.

## Out of scope

- Timed per-item reminders ("push when task X's time arrives") — a natural
  follow-up on the same pipe, but not part of the rhythm vision.
- Pattern-based AI nudges ("you skipped your workout twice") — revisit after
  auto-tuning ships.
- Email / WhatsApp / Telegram channels; Capacitor native app.
- Retry queue / delivery guarantees.
