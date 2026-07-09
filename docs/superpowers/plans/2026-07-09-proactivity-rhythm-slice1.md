# Proactivity Rhythm — Slice ① (Pipe End-to-End) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working push-notification rhythm pipe: a `node-cron` tick reads per-user rhythm rows, sends the daily *morning* Web Push to the user's iPhone PWA, the tap deep-links to `/assistant?kickoff=morning` which auto-sends a server-built seed message, and Settings has a "Send test notification" button.

**Architecture:** All backend logic lives in one new deep module `backend/src/proactivity.ts` (Zod schemas as single source of truth, pure `findDueTouchpoints` for scheduling, `web-push` sender with 410-prune). Routes in `backend/src/routes/proactivity.ts` stay thin. Data lives in two new Supabase tables: `user_rhythm` (one JSONB row per user, mirroring the `user_settings` pattern) and `push_subscriptions` (many per user). Frontend extends the existing `public/sw.js` push handler, adds a re-verify-on-open subscribe flow, and a Settings test button. No AI runs at send time — the assistant runs only when the user opens the kickoff.

**Tech Stack:** Express + TypeScript, `node-cron` (already a backend dep), `web-push` (to add), Supabase JS client, Zod, React + Vite, Jest + ts-jest + supertest.

**Conventions to honor (from CLAUDE.md / handoff):**
- Deep module: add to `proactivity.ts`, don't scatter files.
- Zod is the single source of truth; TS types via `z.infer<>`.
- Thin routes: validate → call service → return.
- No silent fallbacks: on failure, surface it (log + prune, or 500).
- Server-keyed AI only; kickoff seed is built server-side, the assistant chat endpoint does the AI.
- Tests mock the whole `../src/supabase-client` `db` object (see `backend/tests/settings-routes.test.ts`) and mock `web-push`.
- Lint is broken repo-wide — verify with `npm test` (backend) + `npm run build` (frontend), NOT lint.
- Day numbers: `0 = Sunday … 6 = Saturday`.
- Commit workflow prepends a narrative entry to `LEDGER.md` (see CLAUDE.md) — but per subagent-driven-development, commit per task with plain messages; the final ledger entry is written once at the end of the slice.

---

## File Structure

**Create:**
- `supabase/migrations/20260709120000_add_proactivity_tables.sql` — `user_rhythm` + `push_subscriptions` tables.
- `backend/src/proactivity.ts` — deep module: Zod schemas, `findDueTouchpoints`, sender+prune, tick, scheduler, `buildKickoffMessage`, static payloads, VAPID init.
- `backend/src/routes/proactivity.ts` — thin routes.
- `backend/tests/proactivity/find-due-touchpoints.test.ts` — pure-function unit tests (STRICT TDD).
- `backend/tests/proactivity/sender-prune.test.ts` — sender + 410-prune (web-push mocked, TDD).
- `backend/tests/proactivity/rhythm-schema.test.ts` — schema defaults.
- `backend/tests/proactivity/proactivity-routes.test.ts` — route integration (db + web-push mocked).
- `src/lib/push.ts` — frontend: `ensurePushSubscription()` (re-verify + subscribe), `urlBase64ToUint8Array` helper.

**Modify:**
- `backend/src/supabase-client.ts` — add rhythm + subscription db methods.
- `backend/src/index.ts` — mount `proactivityRoutes`, start scheduler in the `require.main === module` block.
- `backend/.env.example` (create if missing) + document Railway env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
- `backend/package.json` — add `web-push` dep + `@types/web-push`.
- `public/sw.js` — upgrade `push` handler to parse JSON payload; `notificationclick` opens `data.url`.
- `src/services/api.ts` — add `pushService` + `rhythmService`.
- `src/main.tsx` — call `ensurePushSubscription()` after SW registration (guarded).
- `src/pages/AssistantPage.tsx` — read `?kickoff=<type>`, fetch seed, auto-send once.
- `src/pages/SettingsPage.tsx` — add "Send test notification" button.
- `.env.example` (frontend) — add `VITE_VAPID_PUBLIC_KEY`.

---

## Task 0: Dependencies, migration SQL, and VAPID env scaffolding

**Style:** ponytail (glue). No tests — verified by install + build.

**Files:**
- Modify: `backend/package.json`
- Create: `supabase/migrations/20260709120000_add_proactivity_tables.sql`
- Create/Modify: `backend/.env.example`, `.env.example`

- [ ] **Step 1: Install web-push**

Run from repo root:
```bash
cd backend && npm install web-push@^3.6.7 && npm install --save-dev @types/web-push@^3.6.4 && cd ..
```
Expected: `web-push` and `@types/web-push` appear in `backend/package.json`.

- [ ] **Step 2: Create the migration SQL**

Create `supabase/migrations/20260709120000_add_proactivity_tables.sql`:
```sql
-- Proactivity rhythm: one JSONB row per user (mirrors user_settings).
CREATE TABLE IF NOT EXISTS user_rhythm (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rhythm     JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE user_rhythm ENABLE ROW LEVEL SECURITY;

-- Web Push subscriptions: many per user (phone + desktop).
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint     TEXT NOT NULL,
    p256dh       TEXT NOT NULL,
    auth         TEXT NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
    ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
```
Note: the backend uses the Supabase **service role** key (bypasses RLS), so no per-user RLS policies are required for the server path; RLS is enabled to keep parity with other tables. The owner applies this migration in Supabase manually (there is no automated runner for Supabase in this repo).

- [ ] **Step 3: Document env vars**

If `backend/.env.example` does not exist, create it with just these lines; otherwise append:
```
# Web Push (VAPID) — generate once with: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:lermanori@gmail.com
```
Append to the frontend `.env.example` (create if missing):
```
# Public VAPID key (same value as backend VAPID_PUBLIC_KEY), exposed to the browser
VITE_VAPID_PUBLIC_KEY=
```

- [ ] **Step 4: Generate a dev VAPID keypair for local test runs**

Run:
```bash
cd backend && npx web-push generate-vapid-keys && cd ..
```
Expected: prints a Public Key and Private Key. Do NOT commit real keys. Paste them into your local `backend/.env` and root `.env` (`VITE_VAPID_PUBLIC_KEY` = the public key) for manual testing. Tests do not need real keys (web-push is mocked).

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json supabase/migrations/20260709120000_add_proactivity_tables.sql backend/.env.example .env.example
git commit -m "chore: add web-push dep, proactivity tables migration, VAPID env"
```

---

## Task 1: Rhythm + subscription Zod schemas with defaults

**Style:** TDD (schema defaults are the contract).

**Files:**
- Create: `backend/src/proactivity.ts`
- Test: `backend/tests/proactivity/rhythm-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/proactivity/rhythm-schema.test.ts`:
```ts
import { RhythmSchema, PushSubscriptionSchema, TOUCHPOINT_TYPES } from '../../src/proactivity'

describe('RhythmSchema', () => {
  it('fills full defaults from an empty object', () => {
    const r = RhythmSchema.parse({})
    expect(r.timezone).toBe('UTC')
    expect(r.morning).toEqual({ enabled: true, time: '07:00', days: [0, 1, 2, 3, 4, 5, 6], lastSent: null })
    expect(r.midday).toEqual({ enabled: false, time: '13:00', days: [1, 2, 3, 4, 5], lastSent: null })
    expect(r.weekly).toEqual({ enabled: false, time: '18:00', day: 0, lastSent: null })
  })

  it('keeps provided values and still defaults missing ones', () => {
    const r = RhythmSchema.parse({ timezone: 'America/New_York', morning: { time: '06:30' } })
    expect(r.timezone).toBe('America/New_York')
    expect(r.morning.time).toBe('06:30')
    expect(r.morning.enabled).toBe(true)
    expect(r.morning.days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('rejects a bad time format', () => {
    expect(() => RhythmSchema.parse({ morning: { time: '7am' } })).toThrow()
  })

  it('exposes the closed touchpoint set', () => {
    expect(TOUCHPOINT_TYPES).toEqual(['morning', 'midday', 'weekly'])
  })
})

describe('PushSubscriptionSchema', () => {
  it('parses a browser PushSubscription JSON shape', () => {
    const parsed = PushSubscriptionSchema.parse({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'KEY', auth: 'AUTH' },
    })
    expect(parsed.endpoint).toBe('https://push.example/abc')
    expect(parsed.keys.p256dh).toBe('KEY')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/proactivity/rhythm-schema.test.ts`
Expected: FAIL — `Cannot find module '../../src/proactivity'`.

- [ ] **Step 3: Write the schemas**

Create `backend/src/proactivity.ts` with (only the schema portion for now):
```ts
import { z } from 'zod'

// Closed set of touchpoint types (see spec). Order matters for iteration.
export const TOUCHPOINT_TYPES = ['morning', 'midday', 'weekly'] as const
export type TouchpointType = (typeof TOUCHPOINT_TYPES)[number]

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const timeField = z.string().regex(TIME_RE)
const dayField = z.number().int().min(0).max(6)
// A YYYY-MM-DD local-date string (or null before first send).
const lastSentField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null)

const DailyTouchpointSchema = z.object({
  enabled: z.boolean(),
  time: timeField,
  days: z.array(dayField),
  lastSent: lastSentField,
})

const WeeklyTouchpointSchema = z.object({
  enabled: z.boolean(),
  time: timeField,
  day: dayField,
  lastSent: lastSentField,
})

// Defaults let the feature work before onboarding writes a row.
export const RhythmSchema = z.object({
  timezone: z.string().default('UTC'),
  morning: DailyTouchpointSchema.default({}).catch({}).pipe(DailyTouchpointSchema),
  midday: DailyTouchpointSchema.default({}).catch({}).pipe(DailyTouchpointSchema),
  weekly: WeeklyTouchpointSchema.default({}).catch({}).pipe(WeeklyTouchpointSchema),
}).default({})
```
NOTE: nested `.default({})` on an object whose fields have no per-field defaults will NOT fill sub-fields. To get the exact defaults the test expects, define each touchpoint schema WITH per-field defaults instead. Replace the three touchpoint schemas above with:
```ts
const DailyTouchpointSchema = z.object({
  enabled: z.boolean().default(true),
  time: timeField.default('07:00'),
  days: z.array(dayField).default([0, 1, 2, 3, 4, 5, 6]),
  lastSent: lastSentField,
})

const MiddayTouchpointSchema = z.object({
  enabled: z.boolean().default(false),
  time: timeField.default('13:00'),
  days: z.array(dayField).default([1, 2, 3, 4, 5]),
  lastSent: lastSentField,
})

const WeeklyTouchpointSchema = z.object({
  enabled: z.boolean().default(false),
  time: timeField.default('18:00'),
  day: dayField.default(0),
  lastSent: lastSentField,
})

export const RhythmSchema = z.object({
  timezone: z.string().default('UTC'),
  morning: DailyTouchpointSchema.default({}),
  midday: MiddayTouchpointSchema.default({}),
  weekly: WeeklyTouchpointSchema.default({}),
}).default({})

export type Rhythm = z.infer<typeof RhythmSchema>

// Browser PushSubscription.toJSON() shape.
export const PushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
})
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionSchema>
```
(Delete the first draft of the three schemas + `RhythmSchema`; keep only this corrected version.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/proactivity/rhythm-schema.test.ts`
Expected: PASS (4 + 1 tests green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/proactivity.ts backend/tests/proactivity/rhythm-schema.test.ts
git commit -m "feat(proactivity): rhythm + push-subscription zod schemas with defaults"
```

---

## Task 2: `findDueTouchpoints` — the scheduler core (STRICT TDD)

**Style:** STRICT TDD. This is the critical timezone/DST/idempotency logic. Pure function, no I/O, no mocks.

**Semantics:** the cron tick runs every `windowMinutes` (default 5). A touchpoint is *due* on a tick at UTC instant `now` when, in the user's IANA timezone:
1. the touchpoint is `enabled`, and
2. today's local weekday matches (`days` includes it for daily; `day` equals it for weekly), and
3. the local wall-clock minute-of-day is in `[scheduled, scheduled + windowMinutes)` — i.e. the scheduled time just arrived this tick (a missed tick is **skipped, never caught up**), and
4. `lastSent` (a local YYYY-MM-DD date) is not today's local date (idempotency; a crash after writing `lastSent` never doubles a send, and a tick that fires twice in one window is deduped).

**Files:**
- Modify: `backend/src/proactivity.ts`
- Test: `backend/tests/proactivity/find-due-touchpoints.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/proactivity/find-due-touchpoints.test.ts`:
```ts
import { findDueTouchpoints, RhythmSchema, type DueTouchpoint } from '../../src/proactivity'

// Helper: build a rhythm record (userId + parsed rhythm) with overrides.
function rec(userId: string, overrides: Record<string, unknown>) {
  return { userId, rhythm: RhythmSchema.parse(overrides) }
}

const WINDOW = 5

describe('findDueTouchpoints', () => {
  it('fires morning when local time just reached the scheduled minute', () => {
    // America/New_York is UTC-4 on 2026-07-09 (EDT). 07:02 EDT = 11:02 UTC.
    const now = new Date('2026-07-09T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual<DueTouchpoint[]>([{ userId: 'u1', type: 'morning', localDate: '2026-07-09' }])
  })

  it('does NOT fire when the tick is past the window (missed tick is skipped, not caught up)', () => {
    // 07:07 EDT = 11:07 UTC, window is 5 min → 7 min past 07:00 is outside [0,5).
    const now = new Date('2026-07-09T11:07:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('does NOT fire before the scheduled time', () => {
    const now = new Date('2026-07-09T10:58:00Z') // 06:58 EDT
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('is idempotent: skips when lastSent equals today local date', () => {
    const now = new Date('2026-07-09T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', lastSent: '2026-07-09' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('fires again the next day even though lastSent was yesterday', () => {
    const now = new Date('2026-07-10T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', lastSent: '2026-07-09' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([{ userId: 'u1', type: 'morning', localDate: '2026-07-10' }])
  })

  it('skips disabled touchpoints', () => {
    const now = new Date('2026-07-09T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', enabled: false } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([])
  })

  it('respects daily day-of-week matching (0=Sunday)', () => {
    // 2026-07-09 is a Thursday (weekday 4). Only fire if 4 is in days.
    const now = new Date('2026-07-09T11:02:00Z')
    const notToday = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', days: [0, 6] } })],
      now,
      WINDOW,
    )
    expect(notToday).toEqual([])
    const today = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', days: [4] } })],
      now,
      WINDOW,
    )
    expect(today).toHaveLength(1)
  })

  it('fires weekly only on its configured day', () => {
    // 2026-07-09 Thursday(4), 18:00 EDT = 22:00 UTC.
    const now = new Date('2026-07-09T22:02:00Z')
    const wrongDay = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', weekly: { enabled: true, time: '18:00', day: 0 } })],
      now,
      WINDOW,
    )
    expect(wrongDay).toEqual([])
    const rightDay = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', weekly: { enabled: true, time: '18:00', day: 4 } })],
      now,
      WINDOW,
    )
    expect(rightDay).toEqual([{ userId: 'u1', type: 'weekly', localDate: '2026-07-09' }])
  })

  it('handles a non-UTC timezone that crosses the date line vs UTC', () => {
    // Asia/Tokyo (UTC+9). 07:02 JST on 2026-07-09 = 22:02 UTC on 2026-07-08.
    const now = new Date('2026-07-08T22:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'Asia/Tokyo', morning: { time: '07:00' } })],
      now,
      WINDOW,
    )
    expect(due).toEqual([{ userId: 'u1', type: 'morning', localDate: '2026-07-09' }])
  })

  it('uses wall-clock time across a DST spring-forward (America/New_York)', () => {
    // 2026-03-08 US DST begins; clocks jump 02:00→03:00 EST→EDT.
    // Morning at 07:00 local that day = 11:00 UTC (EDT, UTC-4).
    const now = new Date('2026-03-08T11:02:00Z')
    const due = findDueTouchpoints(
      [rec('u1', { timezone: 'America/New_York', morning: { time: '07:00', days: [0] } })], // 2026-03-08 is Sunday(0)
      now,
      WINDOW,
    )
    expect(due).toEqual([{ userId: 'u1', type: 'morning', localDate: '2026-03-08' }])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/proactivity/find-due-touchpoints.test.ts`
Expected: FAIL — `findDueTouchpoints` / `DueTouchpoint` not exported.

- [ ] **Step 3: Implement `findDueTouchpoints` + local-time helpers**

Append to `backend/src/proactivity.ts`:
```ts
export interface RhythmRecord {
  userId: string
  rhythm: Rhythm
}

export interface DueTouchpoint {
  userId: string
  type: TouchpointType
  localDate: string // YYYY-MM-DD in the user's timezone, used to stamp lastSent
}

// Resolve a UTC instant into a user-local {date, weekday, minuteOfDay} using Intl.
// Intl handles DST automatically (wall-clock is what we compare against).
function localParts(now: Date, timeZone: string): { date: string; weekday: number; minuteOfDay: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const year = get('year')
  const month = get('month')
  const day = get('day')
  // Intl can yield '24' for hour '00' at midnight under hour12:false; normalize.
  const hour = get('hour') === '24' ? '00' : get('hour')
  const minute = get('minute')
  const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    date: `${year}-${month}-${day}`,
    weekday: WEEKDAYS[get('weekday')],
    minuteOfDay: Number(hour) * 60 + Number(minute),
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Selects the touchpoints whose user-local scheduled time falls inside this tick's
 * window and that have not already been sent today. Pure; caller writes lastSent + sends.
 */
export function findDueTouchpoints(records: RhythmRecord[], now: Date, windowMinutes = 5): DueTouchpoint[] {
  const due: DueTouchpoint[] = []

  for (const { userId, rhythm } of records) {
    const local = localParts(now, rhythm.timezone)

    const inWindow = (time: string) => {
      const diff = local.minuteOfDay - timeToMinutes(time)
      return diff >= 0 && diff < windowMinutes
    }

    // Daily touchpoints: morning, midday
    for (const type of ['morning', 'midday'] as const) {
      const tp = rhythm[type]
      if (!tp.enabled) continue
      if (!tp.days.includes(local.weekday)) continue
      if (!inWindow(tp.time)) continue
      if (tp.lastSent === local.date) continue
      due.push({ userId, type, localDate: local.date })
    }

    // Weekly touchpoint
    const w = rhythm.weekly
    if (w.enabled && w.day === local.weekday && inWindow(w.time) && w.lastSent !== local.date) {
      due.push({ userId, type: 'weekly', localDate: local.date })
    }
  }

  return due
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/proactivity/find-due-touchpoints.test.ts`
Expected: PASS (all cases, including Tokyo date-line and DST).

- [ ] **Step 5: Commit**

```bash
git add backend/src/proactivity.ts backend/tests/proactivity/find-due-touchpoints.test.ts
git commit -m "feat(proactivity): findDueTouchpoints scheduler core with tz/DST/idempotency"
```

---

## Task 3: DB methods for rhythm + subscriptions

**Style:** ponytail (glue over Supabase). Verified indirectly by Task 5/6 tests + a smoke build.

**Files:**
- Modify: `backend/src/supabase-client.ts` (add methods to the exported `db` object, near `getUserSettings`)

- [ ] **Step 1: Add the methods**

Insert into the `db` object in `backend/src/supabase-client.ts`, right after `upsertUserSettings` (around line 940):
```ts
  // Proactivity: rhythm (one JSONB row per user, mirrors user_settings)
  async getUserRhythm(userId: string): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from('user_rhythm')
      .select('rhythm')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) throw error
    return (data?.rhythm as Record<string, unknown>) ?? {}
  },

  async upsertUserRhythm(userId: string, rhythm: Record<string, unknown>): Promise<Record<string, unknown>> {
    const existing = await this.getUserRhythm(userId)
    const merged = { ...existing, ...rhythm }
    const { data, error } = await supabase
      .from('user_rhythm')
      .upsert({ user_id: userId, rhythm: merged, updated_at: new Date().toISOString() })
      .select('rhythm')
      .single()
    if (error) throw error
    return data.rhythm as Record<string, unknown>
  },

  // Returns every rhythm row for the scheduler tick.
  async listAllRhythms(): Promise<Array<{ user_id: string; rhythm: Record<string, unknown> }>> {
    const { data, error } = await supabase
      .from('user_rhythm')
      .select('user_id, rhythm')
    if (error) throw error
    return (data ?? []) as Array<{ user_id: string; rhythm: Record<string, unknown> }>
  },

  // Proactivity: push subscriptions
  async addPushSubscription(row: { user_id: string; endpoint: string; p256dh: string; auth: string }) {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ ...row, last_seen_at: new Date().toISOString() }, { onConflict: 'endpoint' })
    if (error) throw error
  },

  async listPushSubscriptions(userId: string): Promise<Array<{ endpoint: string; p256dh: string; auth: string }>> {
    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (error) throw error
    return (data ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>
  },

  async deletePushSubscriptionByEndpoint(endpoint: string) {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
    if (error) throw error
  },
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors referencing `supabase-client.ts` (pre-existing errors elsewhere, if any, are unrelated — note them but do not fix).

- [ ] **Step 3: Commit**

```bash
git add backend/src/supabase-client.ts
git commit -m "feat(proactivity): db methods for rhythm + push subscriptions"
```

---

## Task 4: Web Push sender with 410-prune (TDD, web-push mocked)

**Style:** TDD for the prune-on-Gone branch (a subscription that returns 410/404 must be deleted).

**Files:**
- Modify: `backend/src/proactivity.ts`
- Test: `backend/tests/proactivity/sender-prune.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/proactivity/sender-prune.test.ts`:
```ts
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}))
jest.mock('../../src/supabase-client', () => ({
  db: {
    listPushSubscriptions: jest.fn(),
    deletePushSubscriptionByEndpoint: jest.fn(),
  },
}))

import webpush from 'web-push'
import { db } from '../../src/supabase-client'
import { sendPushToUser } from '../../src/proactivity'

const mockWebpush = webpush as jest.Mocked<typeof webpush>
const mockDb = db as unknown as {
  listPushSubscriptions: jest.Mock
  deletePushSubscriptionByEndpoint: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

describe('sendPushToUser', () => {
  it('sends to every subscription with the given payload', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/a', p256dh: 'A', auth: 'a' },
      { endpoint: 'https://push/b', p256dh: 'B', auth: 'b' },
    ])
    mockWebpush.sendNotification.mockResolvedValue({} as any)

    await sendPushToUser('u1', { title: 'Hi', body: 'there', url: '/assistant?kickoff=morning' })

    expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(2)
    const [subArg, payloadArg] = mockWebpush.sendNotification.mock.calls[0]
    expect(subArg).toEqual({ endpoint: 'https://push/a', keys: { p256dh: 'A', auth: 'a' } })
    expect(JSON.parse(payloadArg as string)).toEqual({ title: 'Hi', body: 'there', url: '/assistant?kickoff=morning' })
    expect(mockDb.deletePushSubscriptionByEndpoint).not.toHaveBeenCalled()
  })

  it('prunes a subscription that returns 410 Gone', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/dead', p256dh: 'D', auth: 'd' },
    ])
    mockWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }))

    await sendPushToUser('u1', { title: 'x', body: 'y', url: '/' })

    expect(mockDb.deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push/dead')
  })

  it('prunes on 404 too, and does not throw', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/404', p256dh: 'D', auth: 'd' },
    ])
    mockWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('nf'), { statusCode: 404 }))

    await expect(sendPushToUser('u1', { title: 'x', body: 'y', url: '/' })).resolves.toBeUndefined()
    expect(mockDb.deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push/404')
  })

  it('does NOT prune on a transient 500 error', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([
      { endpoint: 'https://push/flaky', p256dh: 'D', auth: 'd' },
    ])
    mockWebpush.sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))

    await sendPushToUser('u1', { title: 'x', body: 'y', url: '/' })
    expect(mockDb.deletePushSubscriptionByEndpoint).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/proactivity/sender-prune.test.ts`
Expected: FAIL — `sendPushToUser` not exported.

- [ ] **Step 3: Implement the sender + VAPID init**

Append to `backend/src/proactivity.ts`:
```ts
import webpush from 'web-push'
import { db } from './supabase-client'

export interface PushPayload {
  title: string
  body: string
  url: string
}

let vapidConfigured = false
// Lazily configure VAPID from env so tests (which mock web-push) don't require keys.
export function configureVapid(): boolean {
  if (vapidConfigured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@healthyflow.app'
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  return true
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const subscriptions = await db.listPushSubscriptions(userId)
  const body = JSON.stringify(payload)

  await Promise.all(subscriptions.map(async (sub) => {
    const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }
    try {
      await webpush.sendNotification(subscription, body)
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        // Subscription is dead (iOS silently expires them). Prune it.
        await db.deletePushSubscriptionByEndpoint(sub.endpoint)
      } else {
        // No silent fallback: log and move on (no retry queue in v1).
        console.error(`[proactivity] push send failed for ${sub.endpoint}:`, err)
      }
    }
  }))
}
```
NOTE: place the `import webpush` and `import { db }` lines at the TOP of the file with the other imports, not mid-file. Keep them here in the diff only for clarity.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/proactivity/sender-prune.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit**

```bash
git add backend/src/proactivity.ts backend/tests/proactivity/sender-prune.test.ts
git commit -m "feat(proactivity): web-push sender with 410/404 subscription prune"
```

---

## Task 5: Tick + scheduler wiring

**Style:** TDD for `runProactivityTick` (writes lastSent BEFORE sending — crash-safety), ponytail for the cron glue.

**Semantics:** `runProactivityTick(now)` lists all rhythm rows, computes due touchpoints, and for each: writes `lastSent = localDate` for that touchpoint (via `upsertUserRhythm` merge) **before** calling `sendPushToUser` with the static payload for the type. Order matters: a crash after the write skips the nudge; a crash before the write retries next tick.

**Files:**
- Modify: `backend/src/proactivity.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/tests/proactivity/tick.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/proactivity/tick.test.ts`:
```ts
jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) },
}))
jest.mock('../../src/supabase-client', () => ({
  db: {
    listAllRhythms: jest.fn(),
    upsertUserRhythm: jest.fn().mockResolvedValue({}),
    listPushSubscriptions: jest.fn().mockResolvedValue([]),
    deletePushSubscriptionByEndpoint: jest.fn(),
  },
}))

import { db } from '../../src/supabase-client'
import * as proactivity from '../../src/proactivity'

const mockDb = db as unknown as {
  listAllRhythms: jest.Mock
  upsertUserRhythm: jest.Mock
}

beforeEach(() => jest.clearAllMocks())

describe('runProactivityTick', () => {
  it('stamps lastSent before sending and sends the morning payload', async () => {
    mockDb.listAllRhythms.mockResolvedValue([
      { user_id: 'u1', rhythm: { timezone: 'America/New_York', morning: { enabled: true, time: '07:00' } } },
    ])
    const sendSpy = jest.spyOn(proactivity, 'sendPushToUser').mockResolvedValue()

    // 07:02 EDT = 11:02 UTC on Thursday 2026-07-09
    await proactivity.runProactivityTick(new Date('2026-07-09T11:02:00Z'), 5)

    // lastSent stamped for the morning touchpoint with the local date
    expect(mockDb.upsertUserRhythm).toHaveBeenCalledWith('u1', { morning: expect.objectContaining({ lastSent: '2026-07-09' }) })
    // stamp happens before the send
    const stampOrder = mockDb.upsertUserRhythm.mock.invocationCallOrder[0]
    const sendOrder = sendSpy.mock.invocationCallOrder[0]
    expect(stampOrder).toBeLessThan(sendOrder)
    // morning static payload deep-links to the kickoff
    expect(sendSpy).toHaveBeenCalledWith('u1', expect.objectContaining({ url: '/assistant?kickoff=morning' }))
  })

  it('sends nothing when no touchpoint is due', async () => {
    mockDb.listAllRhythms.mockResolvedValue([
      { user_id: 'u1', rhythm: { timezone: 'America/New_York', morning: { enabled: true, time: '07:00' } } },
    ])
    const sendSpy = jest.spyOn(proactivity, 'sendPushToUser').mockResolvedValue()
    await proactivity.runProactivityTick(new Date('2026-07-09T09:00:00Z'), 5) // 05:00 EDT
    expect(sendSpy).not.toHaveBeenCalled()
    expect(mockDb.upsertUserRhythm).not.toHaveBeenCalled()
  })
})
```
NOTE: `jest.spyOn(proactivity, 'sendPushToUser')` requires the tick to call `sendPushToUser` via the module namespace so the spy intercepts it. Implement the tick to call the exported binding — see the implementation note below.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/proactivity/tick.test.ts`
Expected: FAIL — `runProactivityTick` not exported.

- [ ] **Step 3: Implement tick, static payloads, and scheduler**

Append to `backend/src/proactivity.ts`:
```ts
import cron from 'node-cron'

// Static, deterministic payloads. No AI at send time (spec).
const TOUCHPOINT_PAYLOADS: Record<TouchpointType, PushPayload> = {
  morning: { title: 'Good morning ☀️', body: 'Ready to plan your day?', url: '/assistant?kickoff=morning' },
  midday: { title: 'Mid-day check-in', body: 'How is today going? Want to adjust?', url: '/assistant?kickoff=midday' },
  weekly: { title: 'Weekly planning', body: "Let's shape the week ahead.", url: '/assistant?kickoff=weekly' },
}

// Exported object indirection so tests can spy on sendPushToUser.
export const proactivityInternals = { sendPushToUser }

export async function runProactivityTick(now: Date = new Date(), windowMinutes = 5): Promise<void> {
  const rows = await db.listAllRhythms()
  const records: RhythmRecord[] = rows.map((row) => ({
    userId: row.user_id,
    rhythm: RhythmSchema.parse(row.rhythm ?? {}),
  }))

  const due = findDueTouchpoints(records, now, windowMinutes)

  for (const item of due) {
    // Idempotency: stamp lastSent BEFORE sending so a crash skips, never doubles.
    await db.upsertUserRhythm(item.userId, { [item.type]: { lastSent: item.localDate } } as Record<string, unknown>)
    await proactivityInternals.sendPushToUser(item.userId, TOUCHPOINT_PAYLOADS[item.type])
  }
}

let schedulerStarted = false
export function startProactivityScheduler(): void {
  if (schedulerStarted) return
  if (!configureVapid()) {
    console.warn('[proactivity] VAPID keys missing — scheduler not started')
    return
  }
  schedulerStarted = true
  // Every 5 minutes.
  cron.schedule('*/5 * * * *', () => {
    runProactivityTick(new Date(), 5).catch((err) => console.error('[proactivity] tick failed:', err))
  })
  console.log('[proactivity] scheduler started (*/5 * * * *)')
}
```
IMPORTANT for the test spy: the test does `jest.spyOn(proactivity, 'sendPushToUser')`. Because `runProactivityTick` calls `proactivityInternals.sendPushToUser` (not the spied export), that spy would NOT intercept. To make the provided test pass as written, change the test's spy target OR the call site. Choose the call-site approach: update the test in Step 1 to `jest.spyOn(proactivity.proactivityInternals, 'sendPushToUser')` and assert on that spy. Apply that one-line change to the test before running Step 4. (The upsert-before-send ordering assertion is unaffected.)

Also: the `upsertUserRhythm` merge is shallow (`{...existing, ...rhythm}`), so passing `{ morning: { lastSent } }` would REPLACE the whole `morning` object, dropping `enabled/time/days`. Fix `runProactivityTick` to merge the touchpoint deeply: read current rhythm, spread the existing touchpoint, then set lastSent:
```ts
    const current = records.find((r) => r.userId === item.userId)!.rhythm
    const currentTp = current[item.type] as Record<string, unknown>
    await db.upsertUserRhythm(item.userId, { [item.type]: { ...currentTp, lastSent: item.localDate } })
```
Update the test assertion accordingly (it already uses `expect.objectContaining({ lastSent: '2026-07-09' })`, which still holds).

- [ ] **Step 4: Apply the two test tweaks noted above, then run**

Run: `cd backend && npx jest tests/proactivity/tick.test.ts`
Expected: PASS (2 cases).

- [ ] **Step 5: Wire the scheduler into the server entrypoint**

In `backend/src/index.ts`, add the import near the other imports:
```ts
import { startProactivityScheduler } from './proactivity'
```
Inside the existing `if (require.main === module) { app.listen(...) }` block, after the `console.log` lines, add:
```ts
    startProactivityScheduler()
```
(Starting it only under `require.main === module` keeps the scheduler out of the test process, which imports `app` from `./index`.)

- [ ] **Step 6: Run the whole proactivity suite**

Run: `cd backend && npx jest tests/proactivity`
Expected: PASS (schema, find-due, sender-prune, tick).

- [ ] **Step 7: Commit**

```bash
git add backend/src/proactivity.ts backend/src/index.ts backend/tests/proactivity/tick.test.ts
git commit -m "feat(proactivity): cron tick with crash-safe lastSent stamping + scheduler"
```

---

## Task 6: Kickoff builder + thin routes

**Style:** ponytail routes; TDD-ish integration test (db + web-push mocked). `buildKickoffMessage` reuses `buildDailyContext`.

**Endpoints (all under `/api/proactivity`, all `authenticateToken`):**
- `POST /push/subscribe` — body = browser `PushSubscription` JSON → store row.
- `DELETE /push/subscribe` — body `{ endpoint }` → delete row.
- `GET /rhythm` → `RhythmSchema.parse(stored)`.
- `PUT /rhythm` → validate partial, upsert, return parsed.
- `POST /test-notification` → `sendPushToUser(userId, morning payload)` → `{ ok: true }`.
- `GET /kickoff?type=morning` → `{ message }` server-built seed for the assistant.

**Files:**
- Modify: `backend/src/proactivity.ts` (add `buildKickoffMessage`)
- Create: `backend/src/routes/proactivity.ts`
- Modify: `backend/src/index.ts` (mount routes)
- Test: `backend/tests/proactivity/proactivity-routes.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `backend/tests/proactivity/proactivity-routes.test.ts`:
```ts
jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn().mockResolvedValue({}) },
}))
jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserRhythm: jest.fn(),
    upsertUserRhythm: jest.fn(),
    addPushSubscription: jest.fn(),
    deletePushSubscriptionByEndpoint: jest.fn(),
    listPushSubscriptions: jest.fn(),
  },
}))
jest.mock('../../src/daily-context', () => ({
  buildDailyContext: jest.fn(),
}))

import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { buildDailyContext } from '../../src/daily-context'

const mockDb = db as unknown as Record<string, jest.Mock>
const mockBuildDailyContext = buildDailyContext as jest.Mock
const TOKEN = `Bearer ${jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET!)}`

beforeEach(() => jest.clearAllMocks())

describe('proactivity routes', () => {
  it('GET /rhythm returns parsed defaults', async () => {
    mockDb.getUserRhythm.mockResolvedValue({})
    const res = await request(app).get('/api/proactivity/rhythm').set('Authorization', TOKEN)
    expect(res.status).toBe(200)
    expect(res.body.morning.time).toBe('07:00')
    expect(res.body.timezone).toBe('UTC')
  })

  it('PUT /rhythm validates and upserts', async () => {
    mockDb.upsertUserRhythm.mockResolvedValue({ timezone: 'America/New_York', morning: { time: '06:30' } })
    const res = await request(app)
      .put('/api/proactivity/rhythm')
      .set('Authorization', TOKEN)
      .send({ timezone: 'America/New_York', morning: { time: '06:30' } })
    expect(res.status).toBe(200)
    expect(mockDb.upsertUserRhythm).toHaveBeenCalledWith('u1', { timezone: 'America/New_York', morning: { time: '06:30' } })
  })

  it('POST /push/subscribe stores the subscription', async () => {
    mockDb.addPushSubscription.mockResolvedValue(undefined)
    const res = await request(app)
      .post('/api/proactivity/push/subscribe')
      .set('Authorization', TOKEN)
      .send({ endpoint: 'https://push/x', keys: { p256dh: 'P', auth: 'A' } })
    expect(res.status).toBe(201)
    expect(mockDb.addPushSubscription).toHaveBeenCalledWith({ user_id: 'u1', endpoint: 'https://push/x', p256dh: 'P', auth: 'A' })
  })

  it('POST /push/subscribe rejects a malformed body', async () => {
    const res = await request(app)
      .post('/api/proactivity/push/subscribe')
      .set('Authorization', TOKEN)
      .send({ endpoint: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('DELETE /push/subscribe removes by endpoint', async () => {
    mockDb.deletePushSubscriptionByEndpoint.mockResolvedValue(undefined)
    const res = await request(app)
      .delete('/api/proactivity/push/subscribe')
      .set('Authorization', TOKEN)
      .send({ endpoint: 'https://push/x' })
    expect(res.status).toBe(200)
    expect(mockDb.deletePushSubscriptionByEndpoint).toHaveBeenCalledWith('https://push/x')
  })

  it('POST /test-notification sends a push and returns ok', async () => {
    mockDb.listPushSubscriptions.mockResolvedValue([{ endpoint: 'https://push/x', p256dh: 'P', auth: 'A' }])
    const res = await request(app).post('/api/proactivity/test-notification').set('Authorization', TOKEN)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('GET /kickoff builds a morning seed message from daily context', async () => {
    mockBuildDailyContext.mockResolvedValue({
      date: '2026-07-09',
      day: { tasks: [{ title: 'Gym', completed: false, startTime: '08:00' }], calorieEntries: [], workoutSessions: [] },
      signals: [],
    })
    const res = await request(app).get('/api/proactivity/kickoff?type=morning').set('Authorization', TOKEN)
    expect(res.status).toBe(200)
    expect(typeof res.body.message).toBe('string')
    expect(res.body.message.toLowerCase()).toContain('morning')
  })

  it('GET /kickoff rejects an unknown type', async () => {
    const res = await request(app).get('/api/proactivity/kickoff?type=bogus').set('Authorization', TOKEN)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && npx jest tests/proactivity/proactivity-routes.test.ts`
Expected: FAIL — route not mounted (`404`) / `buildKickoffMessage` missing.

- [ ] **Step 3: Add `buildKickoffMessage` to proactivity.ts**

Append to `backend/src/proactivity.ts`:
```ts
import { buildDailyContext } from './daily-context'

const KICKOFF_INTROS: Record<TouchpointType, string> = {
  morning: 'Good morning! Help me plan today. Here is my current day context:',
  midday: 'Mid-day check-in. Help me adjust the rest of today. Current context:',
  weekly: 'Weekly planning. Help me place work across the coming days. Current context:',
}

// Server-built seed message the assistant responds to. No AI here — the assistant
// chat endpoint runs the model when the client sends this as the first user turn.
export async function buildKickoffMessage(userId: string, type: TouchpointType): Promise<string> {
  const context = await buildDailyContext(userId)
  const tasks = context.day.tasks
    .filter((t) => !t.completed)
    .map((t) => `- ${t.title}${t.startTime ? ` at ${t.startTime}` : ''}`)
    .join('\n')
  const summary = tasks || '- (nothing scheduled yet)'
  return `${KICKOFF_INTROS[type]}\n\nDate: ${context.date}\nOpen items today:\n${summary}`
}
```
(Move the `import { buildDailyContext }` to the top with the other imports.)

- [ ] **Step 4: Create the thin route file**

Create `backend/src/routes/proactivity.ts`:
```ts
import express from 'express'
import { z } from 'zod'
import { db } from '../supabase-client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import {
  RhythmSchema,
  PushSubscriptionSchema,
  TOUCHPOINT_TYPES,
  buildKickoffMessage,
  sendPushToUser,
  type TouchpointType,
} from '../proactivity'

const router = express.Router()

// GET /api/proactivity/rhythm
router.get('/rhythm', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const stored = await db.getUserRhythm(req.user.userId)
    res.json(RhythmSchema.parse(stored))
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// PUT /api/proactivity/rhythm — accepts a partial patch of the rhythm.
const RhythmPatch = z.object({
  timezone: z.string(),
  morning: z.record(z.string(), z.unknown()),
  midday: z.record(z.string(), z.unknown()),
  weekly: z.record(z.string(), z.unknown()),
}).partial().strict()

router.put('/rhythm', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = RhythmPatch.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    const stored = await db.upsertUserRhythm(req.user.userId, parsed.data)
    res.json(RhythmSchema.parse(stored))
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// POST /api/proactivity/push/subscribe
router.post('/push/subscribe', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = PushSubscriptionSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    await db.addPushSubscription({
      user_id: req.user.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    })
    res.status(201).json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// DELETE /api/proactivity/push/subscribe
const UnsubBody = z.object({ endpoint: z.string().url() })
router.delete('/push/subscribe', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = UnsubBody.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues })
  try {
    await db.deletePushSubscriptionByEndpoint(parsed.data.endpoint)
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Database error' })
  }
})

// POST /api/proactivity/test-notification
router.post('/test-notification', authenticateToken, async (req: AuthRequest, res) => {
  try {
    await sendPushToUser(req.user.userId, {
      title: 'HealthyFlow test 🔔',
      body: 'Push is working. Tap to open the assistant.',
      url: '/assistant?kickoff=morning',
    })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to send test notification' })
  }
})

// GET /api/proactivity/kickoff?type=morning
router.get('/kickoff', authenticateToken, async (req: AuthRequest, res) => {
  const type = req.query.type
  if (typeof type !== 'string' || !TOUCHPOINT_TYPES.includes(type as TouchpointType)) {
    return res.status(400).json({ error: 'Invalid kickoff type' })
  }
  try {
    const message = await buildKickoffMessage(req.user.userId, type as TouchpointType)
    res.json({ message })
  } catch (err) {
    // No silent fallback — surface the failure so the assistant shows its error state.
    res.status(500).json({ error: 'Failed to build kickoff' })
  }
})

export { router as proactivityRoutes }
```

- [ ] **Step 5: Mount the routes in index.ts**

In `backend/src/index.ts`, add the import:
```ts
import { proactivityRoutes } from './routes/proactivity'
```
And mount it with the others:
```ts
app.use('/api/proactivity', proactivityRoutes)
```

- [ ] **Step 6: Run the route test**

Run: `cd backend && npx jest tests/proactivity/proactivity-routes.test.ts`
Expected: PASS (8 cases).

- [ ] **Step 7: Run the full backend suite (no regressions)**

Run: `cd backend && npm test`
Expected: all suites PASS (proactivity suites green; pre-existing suites unaffected).

- [ ] **Step 8: Commit**

```bash
git add backend/src/proactivity.ts backend/src/routes/proactivity.ts backend/src/index.ts backend/tests/proactivity/proactivity-routes.test.ts
git commit -m "feat(proactivity): thin routes for push/rhythm/test/kickoff + kickoff builder"
```

---

## Task 7: Frontend — service worker payload + subscribe-on-open flow

**Style:** ponytail (glue). Verified by frontend `npm run build` + code inspection (real push verified on-device by owner via the test button).

**Files:**
- Modify: `public/sw.js`
- Create: `src/lib/push.ts`
- Modify: `src/main.tsx`

- [ ] **Step 1: Upgrade the service worker push + click handlers**

In `public/sw.js`, replace the existing `self.addEventListener('push', ...)` handler with one that parses the JSON payload our sender sends:
```js
self.addEventListener('push', (event) => {
  let payload = { title: 'HealthyFlow', body: 'New notification', url: '/' }
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch (_e) {
      payload.body = event.data.text()
    }
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    data: { url: payload.url },
  }

  event.waitUntil(self.registration.showNotification(payload.title, options))
})
```
And replace `notificationclick` so it focuses an existing window (navigating it to the kickoff URL) or opens a new one:
```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl)
    })
  )
})
```
Also bump the cache version at the top so the new worker activates: change `const CACHE_VERSION = 'healthyflow-v4'` to `'healthyflow-v5'`.

- [ ] **Step 2: Create the subscribe helper**

Create `src/lib/push.ts`:
```ts
import { pushService } from '../services/api'

// VAPID public key must be URL-safe-base64 → Uint8Array for PushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/**
 * Verify-on-open: iOS silently expires push subscriptions, so on every app open we
 * check for a live subscription and (re)subscribe, then sync it to the server.
 * Safe to call unconditionally; it no-ops when unsupported or permission isn't granted.
 */
export async function ensurePushSubscription(): Promise<void> {
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidKey) return
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (Notification.permission !== 'granted') return

  try {
    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
    }
    await pushService.subscribe(subscription.toJSON())
  } catch (err) {
    console.error('[push] ensureSubscription failed:', err)
  }
}

/** Request permission then subscribe. Returns true if a live subscription now exists. */
export async function enablePush(): Promise<boolean> {
  if (!('Notification' in window)) return false
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return false
  await ensurePushSubscription()
  return true
}
```

- [ ] **Step 3: Call `ensurePushSubscription` on app load**

In `src/main.tsx`, inside the existing `window.addEventListener('load', ...)` callback (after `.register('/sw.js')` resolves), re-verify the subscription. Simplest: add a separate listener at the end of the SW block:
```ts
  window.addEventListener('load', () => {
    import('./lib/push').then(({ ensurePushSubscription }) => ensurePushSubscription())
  })
```
(Dynamic import keeps push code out of the initial bundle; it no-ops unless permission is already granted.)

- [ ] **Step 4: Build to verify types + bundle**

Run (repo root): `npm run build`
Expected: build succeeds. (`pushService` is added in Task 8; if building Task 7 alone fails on the missing `pushService` import, do Task 8 before building. Commit Task 7 + 8 together in that case.)

- [ ] **Step 5: Commit**

```bash
git add public/sw.js src/lib/push.ts src/main.tsx
git commit -m "feat(proactivity): SW JSON push payload + verify-on-open subscribe flow"
```

---

## Task 8: Frontend — API services, Settings test button, Assistant kickoff

**Style:** ponytail (glue). Verified by `npm run build`.

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/pages/AssistantPage.tsx`

- [ ] **Step 1: Add `pushService` + `rhythmService` to api.ts**

In `src/services/api.ts`, after the `settingsService` block (around line 723), add:
```ts
export interface PushSubscriptionJSON {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export const pushService = {
  subscribe: async (subscription: PushSubscriptionJSON): Promise<void> => {
    await api.post('/proactivity/push/subscribe', subscription)
  },
  unsubscribe: async (endpoint: string): Promise<void> => {
    await api.delete('/proactivity/push/subscribe', { data: { endpoint } })
  },
  sendTest: async (): Promise<void> => {
    await api.post('/proactivity/test-notification')
  },
  getKickoff: async (type: 'morning' | 'midday' | 'weekly'): Promise<string> => {
    const response = await api.get('/proactivity/kickoff', { params: { type } })
    return response.data.message
  },
}
```

- [ ] **Step 2: Add the "Send test notification" button to Settings**

In `src/pages/SettingsPage.tsx`: import the helpers at the top:
```ts
import { pushService } from '../services/api'
import { enablePush } from '../lib/push'
import toast from 'react-hot-toast'
```
(Only add imports that aren't already present — check the file first; `toast` is very likely already imported.)

Add a handler inside the component:
```ts
  const handleTestNotification = async () => {
    const ok = await enablePush()
    if (!ok) {
      toast.error('Enable notifications first (install to Home Screen on iPhone).')
      return
    }
    try {
      await pushService.sendTest()
      toast.success('Test notification sent — check your device.')
    } catch {
      toast.error('Could not send test notification.')
    }
  }
```

Render a button in a sensible existing settings section (near the notifications toggles). Match the surrounding button styling; a minimal version:
```tsx
        <button
          type="button"
          onClick={handleTestNotification}
          className="mt-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Send test notification
        </button>
```
(Read the file first and drop this inside the notifications-related card so it visually belongs. Reuse an existing button class from the file if one is already defined.)

- [ ] **Step 3: Auto-send the kickoff seed in AssistantPage**

In `src/pages/AssistantPage.tsx`:
- Add `useSearchParams` to the existing `react-router-dom` import.
- Import the service: `import { pushService } from '../services/api'` (near the other `../services/api` imports — check whether `aiService` is already imported from there and add to that line).

Inside `AssistantPage()`, after the existing state/hooks and the `sendMessage` definition, add a one-shot effect. Use a ref guard so React StrictMode's double-mount and re-renders don't fire it twice:
```tsx
  const [searchParams, setSearchParams] = useSearchParams()
  const kickoffFiredRef = useRef(false)

  useEffect(() => {
    const kickoff = searchParams.get('kickoff')
    if (!kickoff || kickoffFiredRef.current) return
    if (!['morning', 'midday', 'weekly'].includes(kickoff)) return
    kickoffFiredRef.current = true
    // Clear the param so a refresh doesn't re-fire.
    const next = new URLSearchParams(searchParams)
    next.delete('kickoff')
    setSearchParams(next, { replace: true })

    ;(async () => {
      try {
        const seed = await pushService.getKickoff(kickoff as 'morning' | 'midday' | 'weekly')
        await sendMessage(seed)
      } catch {
        // buildKickoff failure surfaces via sendMessage's own error handling if it
        // reaches the chat; here we just avoid a silent hang.
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```
NOTE: `sendMessage` is defined above in the component; ensure this effect is placed AFTER its declaration so the closure captures it. `sendMessage` already sets `isSending` and appends messages, so the kickoff seed shows in the thread exactly like a typed message.

- [ ] **Step 4: Build**

Run (repo root): `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts src/pages/SettingsPage.tsx src/pages/AssistantPage.tsx
git commit -m "feat(proactivity): push API services, Settings test button, assistant kickoff auto-send"
```

---

## Final verification (whole slice)

- [ ] **Backend tests**

Run: `cd backend && npm test`
Expected: all suites PASS, including the four `tests/proactivity/*` suites.

- [ ] **Frontend build**

Run (repo root): `npm run build`
Expected: succeeds.

- [ ] **Skip lint** — broken repo-wide (missing ESLint config); do not chase it.

- [ ] **Ledger + final housekeeping**

Prepend a narrative entry to `LEDGER.md` per the CLAUDE.md format, then confirm the branch is clean.

- [ ] **Owner hand-back note** — tell the owner exactly how to verify real iPhone push (see the spec's device-verification path): apply the migration in Supabase, set the three VAPID env vars in Railway + `VITE_VAPID_PUBLIC_KEY` in Netlify, install the PWA to the Home Screen, open Settings → "Send test notification", and confirm the banner deep-links into `/assistant?kickoff=morning` with an auto-sent morning seed.

---

## Self-Review (against the spec)

**Spec coverage (slice ① scope):**
- `push_subscriptions` table → Task 0 migration + Task 3 db methods. ✅
- Service worker push handling → Task 7 (`push` + `notificationclick`). ✅
- Subscribe flow with iOS re-verify on open → Task 7 `ensurePushSubscription` + Task 3 wiring in main.tsx. ✅
- VAPID env setup → Task 0 env docs + Task 4 `configureVapid`. ✅
- node-cron tick → Task 5 `startProactivityScheduler` (`*/5 * * * *`). ✅
- `user_rhythm` table with defaults → Task 0 migration + Task 1 `RhythmSchema` defaults. ✅
- Morning touchpoint send → Task 5 `TOUCHPOINT_PAYLOADS.morning` + tick. ✅
- Morning assistant kickoff via `/assistant?kickoff=morning` → Task 6 `buildKickoffMessage` + `/kickoff` route + Task 8 AssistantPage effect. ✅
- Settings "send test notification" button → Task 6 `/test-notification` route + Task 8 Settings button. ✅
- Idempotency (lastSent before send; skip not catch-up) → Task 2 window semantics + Task 5 stamp-before-send. ✅
- 410 prune → Task 4. ✅
- web-push mocked in tests → Tasks 4/5/6. ✅

**Out of slice ① (correctly deferred to slices 2–3):** midday/weekly kickoff *content* is stubbed with payloads/intros but not the full Settings Rhythm section or onboarding seed step (slice 2); auto-tuning (slice 3). The midday/weekly payloads + intros are included cheaply so the closed set is complete, but no UI drives them yet — acceptable.

**Type consistency:** `TouchpointType`, `Rhythm`, `RhythmRecord`, `DueTouchpoint`, `PushPayload`, `PushSubscriptionInput` defined in Task 1/2/4 and reused consistently in routes (Task 6). `findDueTouchpoints(records, now, windowMinutes)` signature stable across Tasks 2 and 5. `sendPushToUser(userId, payload)` stable across Tasks 4/5/6. `pushService.getKickoff` return type (`string`) matches route `{ message }` unwrap.

**Placeholder scan:** no TBD/TODO; every code step has full code. Two test/impl reconciliation notes are called out explicitly in Task 5 (spy target + deep-merge) so the executor applies them rather than discovering a mismatch.
