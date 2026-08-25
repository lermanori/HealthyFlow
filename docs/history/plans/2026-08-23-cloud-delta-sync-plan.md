# Cloud delta sync — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloud subscriber's changes travel to the server and back, so their day survives a lost phone and appears on a second device.

**Architecture:** One endpoint with the same shape in both directions, so the merge rule has one implementation. The device sends rows changed since a watermark; the server returns rows *it* has changed since the same watermark; both sides merge with most-recently-changed-wins. Offline is not a special case — the watermark simply does not advance.

**Tech Stack:** Postgres (Supabase) + a trigger for `updated_at`; Express + Zod on the server; the existing `mutateLocalDatabase` funnel and `@capacitor/network` events on the client.

**Spec:** `docs/history/specs/2026-08-23-cloud-delta-sync-design.md`
**Decisions:** ADR-0011 (the Local day), ADR-0012 (entry is open, local is the source for everyone)

---

## Why the order is what it is

Tasks 1 and 2 are the spec's prerequisites and they land first, because until both
are true nothing after them can be tested. A table that cannot say what changed has
no delta. A delete that does not travel makes every sync wrong **in a way that looks
like sync working** — the meal comes back and nothing reports an error.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260823120000_add_tasks_updated_at.sql` | **Create** — the column, its backfill, and the trigger that keeps it true |
| `src/lib/local/health.ts` | **Modify** — soft delete and filter on read, as Items already do |
| `backend/src/sync-contracts.ts` | **Create** — the exchange shape and the merge rule, browser-safe so both sides run one copy |
| `backend/src/sync.ts` | **Modify/Create** — the service: read the delta, apply the incoming one |
| `backend/src/routes/sync.ts` | **Create** — validate, call the service, return |
| `backend/src/index.ts` | **Modify** — register the route |
| `src/lib/local/sync.ts` | **Create** — the client exchange, its watermark, its cadence |
| `src/lib/local/store.ts` | **Modify** — hold the watermark in the document |

---

## Task 1: `tasks` can say what changed

**Files:**
- Create: `supabase/migrations/20260823120000_add_tasks_updated_at.sql`

Every other table has `updated_at`. `tasks` does not, and it is the table the day is
made of. This is the third time this missing column has caused a problem.

- [ ] **Step 1: Write the migration**

```sql
-- Delta sync asks "what changed since X". The tasks table could not answer:
-- every other table carries updated_at and this one never did.
--
-- A trigger rather than application code, deliberately. Task rows are written from
-- the routes, the AI capabilities, the Talk workflows, rollover and habit
-- materialization. Setting the column at each of those means one of them is
-- eventually missed, and a row that silently stops syncing is indistinguishable
-- from one that never changed.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- Existing rows have only ever been created, as far as anything can now tell.
UPDATE tasks SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE tasks
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE tasks
  ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_touch_updated_at ON tasks;

CREATE TRIGGER tasks_touch_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION touch_updated_at();

-- The delta query is "mine, changed since X", so it is indexed that way.
CREATE INDEX IF NOT EXISTS idx_tasks_user_updated_at
  ON tasks (user_id, updated_at);
```

- [ ] **Step 2: Apply it**

Run: `supabase db push`
Expected: the migration applies.

If Postgres ports are unreachable, a VPN is usually the cause — check
`route -n get default` for a `utun*` interface. Otherwise paste the SQL into the
Supabase dashboard SQL editor and record it:

```sql
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260823120000') ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Confirm the column is live and populated**

```bash
node -e "
const d=require('dotenv').config({path:'.env'}).parsed;
fetch(d.SUPABASE_URL+'/rest/v1/tasks?select=id,created_at,updated_at&limit=3',
 {headers:{apikey:d.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+d.SUPABASE_SERVICE_ROLE_KEY}})
 .then(r=>r.json()).then(rows=>console.log(rows));
"
```

Expected: three rows, each with a non-null `updated_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260823120000_add_tasks_updated_at.sql
git commit -m "feat: tasks can say when they last changed"
```

---

## Task 2: a deleted health record stays deleted

**Files:**
- Modify: `src/lib/local/health.ts`
- Modify: `src/lib/local/health.test.ts`

Items soft-delete. The four health kinds remove the row from the array, so to the
server "absent" and "deleted" are identical and the next pull resurrects it.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/local/health.test.ts`:

```ts
describe('deleting a health record', () => {
  // Absent and deleted look identical to a server. A meal removed from the array
  // is a meal the next sync will put back, and nothing will report an error.
  it('keeps the row and marks it, the way Items already do', async () => {
    const entry = await createLocalCalorieEntry(USER, {
      date: TODAY, name: 'Porridge', calories: 300,
    })

    await removeLocalCalorieEntry(USER, entry.id)

    assert.deepEqual(await localCalorieEntries(USER, TODAY), [])
    const database = await loadLocalDatabase(USER)
    assert.equal(database.calorieEntries.length, 1)
    assert.ok((database.calorieEntries[0] as { deletedAt?: string }).deletedAt)
  })

  it('hides it from every read, not just the day', async () => {
    const entry = await createLocalWeightEntry(USER, { date: TODAY, weightKg: 80 })
    await removeLocalWeightEntry(USER, entry.id)

    assert.equal(await localWeightEntry(USER, TODAY), null)
    assert.deepEqual(await localRecentWeightEntries(USER), [])
  })

  it('refuses to delete something twice', async () => {
    const entry = await createLocalCalorieEntry(USER, {
      date: TODAY, name: 'Porridge', calories: 300,
    })
    await removeLocalCalorieEntry(USER, entry.id)

    await assert.rejects(() => removeLocalCalorieEntry(USER, entry.id), LocalStoreError)
  })
})
```

Add whatever of `createLocalWeightEntry`, `localRecentWeightEntries`,
`loadLocalDatabase` and `LocalStoreError` the file does not already import.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lib/local/health.test.ts`
Expected: FAIL — `calorieEntries.length` is 0, because the row was removed.

- [ ] **Step 3: Soft-delete, and filter on read**

In `src/lib/local/health.ts`, replace `discard` and `read`:

```ts
/**
 * Mark a record deleted rather than removing it.
 *
 * A removed row and a row that was never there are the same thing to anything
 * downstream, so a delete has to travel as data. Items have always done this;
 * health did not, and a sync would have resurrected every deleted meal.
 */
function discard(userId: string, name: HealthCollection, id: string): Promise<void> {
  return mutateLocalDatabase(userId, (database) => {
    const rows = collection<Record_>(database, name)
    const existing = rows.find((row) => row.id === id && !row.deletedAt)
    if (!existing) throw new LocalStoreError(`Nothing on this device with id ${id}.`)
    const timestamp = nowIso()
    return {
      next: {
        ...database,
        [name]: rows.map((row) => (
          row.id === id ? { ...row, deletedAt: timestamp, updatedAt: timestamp } : row
        )),
      },
      result: undefined,
    }
  })
}

/** Every live record of a kind. Deleted rows stay stored and are never returned. */
async function read<T extends Record_>(userId: string, name: HealthCollection): Promise<T[]> {
  const rows = collection<T>(await loadLocalDatabase(userId), name)
  return rows.filter((row) => !(row as { deletedAt?: string }).deletedAt)
}
```

Add `deletedAt` to the `Record_` type at the top of the file:

```ts
type Record_ = { id: string; userId: string; deletedAt?: string | null; [key: string]: unknown }
```

- [ ] **Step 4: Check the achievement cascade uses the same rule**

`removeLocalAchievement` filters entries out of the array directly. Change it to
mark them, so those deletions travel too:

```ts
export async function removeLocalAchievement(userId: string, id: string) {
  // Its entries go with it: an entry that points at nothing would be a record
  // nobody can read and nobody can delete. Marked, not removed, so the deletion
  // reaches the server.
  await mutateLocalDatabase(userId, (database) => {
    const timestamp = nowIso()
    return {
      next: {
        ...database,
        achievementEntries: collection<DatedRecord>(database, 'achievementEntries').map((entry) => (
          entry.achievementId === id ? { ...entry, deletedAt: timestamp, updatedAt: timestamp } : entry
        )),
      },
      result: undefined,
    }
  })
  return discard(userId, 'achievementDefinitions', id)
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: all passing, including the three new ones.

- [ ] **Step 6: Commit**

```bash
git add src/lib/local/health.ts src/lib/local/health.test.ts
git commit -m "fix: a deleted health record must stay deleted"
```

---

## Task 3: the merge rule, once

**Files:**
- Create: `backend/src/sync-contracts.ts`
- Create: `backend/tests/sync/merge.test.ts`

Browser-safe, so the server and the device run one copy. This codebase already has
three functions that exist because a rule got written twice and drifted.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/sync/merge.test.ts`:

```ts
import { mergeRows, isFromTheFuture, SYNC_FUTURE_TOLERANCE_MS } from '../../src/sync-contracts'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'row-1', updated_at: '2026-08-23T10:00:00.000Z', title: 'Server copy', ...over,
})

describe('merging one row against another', () => {
  it('keeps the more recently changed of the two', () => {
    const merged = mergeRows(
      [row()],
      [row({ updated_at: '2026-08-23T11:00:00.000Z', title: 'Device copy' })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0].title).toBe('Device copy')
  })

  it('keeps the stored row when the incoming one is older', () => {
    const merged = mergeRows(
      [row()],
      [row({ updated_at: '2026-08-23T09:00:00.000Z', title: 'Stale device copy' })],
    )
    expect(merged[0].title).toBe('Server copy')
  })

  it('gives an exact tie to the device, on both sides of the exchange', () => {
    // Saying "whichever arrived last" would mean opposite things on the server
    // and on the device, and the two would disagree about the same pair forever.
    const merged = mergeRows([row()], [row({ title: 'Device copy' })])
    expect(merged[0].title).toBe('Device copy')
  })

  it('carries a deletion like any other change', () => {
    const merged = mergeRows(
      [row()],
      [row({ updated_at: '2026-08-23T11:00:00.000Z', deleted_at: '2026-08-23T11:00:00.000Z' })],
    )
    expect(merged[0].deleted_at).toBe('2026-08-23T11:00:00.000Z')
  })

  it('keeps rows that exist on only one side', () => {
    const merged = mergeRows([row({ id: 'only-server' })], [row({ id: 'only-device' })])
    expect(merged.map((r) => r.id).sort()).toEqual(['only-device', 'only-server'])
  })

  it('reads camelCase as readily as snake_case', () => {
    // Items are stored as server rows and health in the client shape, so the rule
    // has to read both or it only works for half the day.
    const merged = mergeRows(
      [{ id: 'a', updatedAt: '2026-08-23T10:00:00.000Z', name: 'Server' }],
      [{ id: 'a', updatedAt: '2026-08-23T11:00:00.000Z', name: 'Device' }],
    )
    expect(merged[0].name).toBe('Device')
  })
})

describe('a clock that is wrong', () => {
  it('refuses a row dated well beyond the server now', () => {
    const now = new Date('2026-08-23T10:00:00.000Z')
    const ahead = new Date(now.getTime() + SYNC_FUTURE_TOLERANCE_MS + 60_000).toISOString()
    expect(isFromTheFuture({ id: 'a', updated_at: ahead }, now)).toBe(true)
  })

  it('tolerates ordinary drift', () => {
    const now = new Date('2026-08-23T10:00:00.000Z')
    const slight = new Date(now.getTime() + 60_000).toISOString()
    expect(isFromTheFuture({ id: 'a', updated_at: slight }, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend test -- tests/sync/merge.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the contract and the rule**

Create `backend/src/sync-contracts.ts`:

```ts
import { z } from 'zod'

/**
 * The exchange, and the one rule it runs on — browser-safe.
 *
 * The request and the response are the same shape on purpose: it forces one merge
 * implementation instead of two. `composeDayTaskRows`, `deriveHabitOutcome` and
 * `summarizeAchievement` all exist because a rule was written twice and drifted,
 * and each cost a bug before it was noticed.
 */

/** Everything that travels, by collection. Rows are opaque here; the merge only reads ids and times. */
export const SyncPayloadSchema = z.object({
  tasks: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  habitProgress: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  calorieEntries: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  calorieItems: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  weightEntries: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  workoutSessions: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  workoutPlans: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  workoutExerciseItems: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  achievementDefinitions: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  achievementEntries: z.array(z.looseObject({ id: z.string().min(1) })).default([]),
  settings: z.looseObject({}).nullable().default(null),
})
export type SyncPayload = z.infer<typeof SyncPayloadSchema>

export const SyncRequestSchema = z.object({
  since: z.string().nullable(),
  changed: SyncPayloadSchema,
})
export type SyncRequest = z.infer<typeof SyncRequestSchema>

export const SyncResponseSchema = z.object({
  syncedAt: z.string(),
  changed: SyncPayloadSchema,
})
export type SyncResponse = z.infer<typeof SyncResponseSchema>

export const SYNC_COLLECTIONS = [
  'tasks', 'habitProgress', 'calorieEntries', 'calorieItems', 'weightEntries',
  'workoutSessions', 'workoutPlans', 'workoutExerciseItems',
  'achievementDefinitions', 'achievementEntries',
] as const
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number]

/** A device more than this far ahead of the server is wrong, not early. */
export const SYNC_FUTURE_TOLERANCE_MS = 5 * 60 * 1000

type Row = { id: string; [key: string]: unknown }

/**
 * When a row last changed, in whichever shape it is stored.
 *
 * Items are kept as server rows and health in the client shape (ADR-0011 and the
 * Health-on-the-device design), so this reads both or it only works for half the
 * day.
 */
export function changedAt(row: Row): string {
  return String(row.updated_at ?? row.updatedAt ?? row.created_at ?? row.createdAt ?? '')
}

/**
 * Whether a row claims to have changed further ahead than a clock can drift.
 *
 * Storing one would let a device with a wrong clock win every conflict until real
 * time caught up. Refusing it costs one sync instead.
 */
export function isFromTheFuture(row: Row, now: Date): boolean {
  const at = Date.parse(changedAt(row))
  if (Number.isNaN(at)) return false
  return at > now.getTime() + SYNC_FUTURE_TOLERANCE_MS
}

/**
 * Union two sets of rows by id, keeping the more recently changed of any pair.
 *
 * `fromDevice` is applied second so an exact tie goes to the device — the same
 * rule, stated the same way, wherever this runs. "Whichever arrived last" would
 * mean opposite things on the two sides and they would never agree.
 */
export function mergeRows(stored: Row[], fromDevice: Row[]): Row[] {
  const merged = new Map<string, Row>()
  for (const row of [...stored, ...fromDevice]) {
    const existing = merged.get(row.id)
    if (!existing || changedAt(row) >= changedAt(existing)) merged.set(row.id, row)
  }
  return [...merged.values()]
}

const SyncContracts = {
  SyncPayloadSchema,
  SyncRequestSchema,
  SyncResponseSchema,
  SYNC_COLLECTIONS,
  SYNC_FUTURE_TOLERANCE_MS,
  changedAt,
  isFromTheFuture,
  mergeRows,
}

export default SyncContracts
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix backend test -- tests/sync/merge.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sync-contracts.ts backend/tests/sync/merge.test.ts
git commit -m "feat: the sync merge rule, in one place both sides can run"
```

---

## Task 4: the server side of the exchange

**Files:**
- Create: `backend/src/sync.ts`
- Create: `backend/src/routes/sync.ts`
- Modify: `backend/src/index.ts`
- Create: `backend/tests/sync/endpoint.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/sync/endpoint.test.ts`:

```ts
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Sync } from '../../src/sync'

jest.mock('../../src/supabase-client', () => ({
  db: { getUserCreditSubscription: jest.fn() },
}))

jest.mock('../../src/sync', () => ({
  Sync: { exchange: jest.fn() },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockSync = Sync as jest.Mocked<typeof Sync>

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
const token = () => jwt.sign({ userId: 'user-1' }, JWT_SECRET, { expiresIn: '1h' })

const emptyPayload = {
  tasks: [], habitProgress: [], calorieEntries: [], calorieItems: [],
  weightEntries: [], workoutSessions: [], workoutPlans: [],
  workoutExerciseItems: [], achievementDefinitions: [], achievementEntries: [],
  settings: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserCreditSubscription.mockResolvedValue({ active: true } as never)
  mockSync.exchange.mockResolvedValue({
    syncedAt: '2026-08-23T12:00:00.000Z',
    changed: emptyPayload,
  } as never)
})

describe('POST /api/sync', () => {
  it('exchanges deltas for a subscriber', async () => {
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token()}`)
      .send({ since: '2026-08-23T11:00:00.000Z', changed: emptyPayload })

    expect(response.status).toBe(200)
    expect(response.body.syncedAt).toBe('2026-08-23T12:00:00.000Z')
    expect(mockSync.exchange).toHaveBeenCalledWith('user-1', expect.objectContaining({
      since: '2026-08-23T11:00:00.000Z',
    }))
  })

  it('accepts a first push, where nothing has been synced yet', async () => {
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token()}`)
      .send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(200)
  })

  it('refuses an account without a Cloud subscription', async () => {
    // Cloud is what hosting is sold as. A free user's data is never hosted
    // (TARGET.md, ADR-0012), so this is a boundary, not an error.
    mockDb.getUserCreditSubscription.mockResolvedValue({ active: false } as never)

    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token()}`)
      .send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('cloud_not_active')
    expect(mockSync.exchange).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    const response = await request(app).post('/api/sync').send({ since: null, changed: emptyPayload })

    expect(response.status).toBe(401)
    expect(mockSync.exchange).not.toHaveBeenCalled()
  })

  it('rejects a body it cannot read', async () => {
    const response = await request(app)
      .post('/api/sync')
      .set('Authorization', `Bearer ${token()}`)
      .send({ since: null })

    expect(response.status).toBe(400)
    expect(mockSync.exchange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend test -- tests/sync/endpoint.test.ts`
Expected: FAIL — 404, the route does not exist.

- [ ] **Step 3: Write the service**

Create `backend/src/sync.ts`:

```ts
import { supabase } from './supabase-client'
import {
  isFromTheFuture,
  SYNC_COLLECTIONS,
  type SyncCollection,
  type SyncRequest,
  type SyncResponse,
} from './sync-contracts'

/**
 * One exchange: take what the device changed, give back what the server has.
 *
 * The watermark returned is the server's own clock. A device clock decides which
 * of two edits was later — that is about when a person did something — but it must
 * never decide what has already been seen, or a skewed clock either misses rows
 * forever or re-sends everything every time.
 */

const TABLES: Record<SyncCollection, string> = {
  tasks: 'tasks',
  habitProgress: 'habit_progress_entries',
  calorieEntries: 'calorie_entries',
  calorieItems: 'calorie_items',
  weightEntries: 'weight_entries',
  workoutSessions: 'workout_sessions',
  workoutPlans: 'workout_plans',
  workoutExerciseItems: 'workout_exercise_items',
  achievementDefinitions: 'achievement_definitions',
  achievementEntries: 'achievement_entries',
}

export class SyncClockError extends Error {
  constructor(public readonly collection: string) {
    super('A record was dated further ahead than a clock can drift.')
    this.name = 'SyncClockError'
  }
}

async function rowsChangedSince(table: string, userId: string, since: string | null) {
  let query = supabase.from(table).select('*').eq('user_id', userId)
  if (since) query = query.gt('updated_at', since)
  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

async function acceptRows(table: string, userId: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return
  // Upsert on the id the device chose. Ids are client-generated precisely so a
  // row can be written twice without becoming two rows (ADR-0011).
  const owned = rows.map((row) => ({ ...row, user_id: userId }))
  const { error } = await supabase.from(table).upsert(owned, { onConflict: 'id' })
  if (error) throw error
}

async function exchange(userId: string, input: SyncRequest): Promise<SyncResponse> {
  const now = new Date()

  for (const collection of SYNC_COLLECTIONS) {
    for (const row of input.changed[collection]) {
      if (isFromTheFuture(row, now)) throw new SyncClockError(collection)
    }
  }

  // Read before write, so the response carries what the server held rather than
  // what this device just sent it. Sending a device its own rows back is harmless
  // but wasteful, and it hides whether the pull half actually works.
  const before = {} as SyncResponse['changed']
  for (const collection of SYNC_COLLECTIONS) {
    ;(before as Record<string, unknown>)[collection] =
      await rowsChangedSince(TABLES[collection], userId, input.since)
  }
  before.settings = null

  for (const collection of SYNC_COLLECTIONS) {
    await acceptRows(TABLES[collection], userId, input.changed[collection] as Record<string, unknown>[])
  }

  if (input.changed.settings) {
    const { error } = await supabase
      .from('user_settings')
      .upsert({ ...input.changed.settings, user_id: userId }, { onConflict: 'user_id' })
    if (error) throw error
  }

  return { syncedAt: now.toISOString(), changed: before }
}

export const Sync = { exchange }
```

- [ ] **Step 4: Write the route**

Create `backend/src/routes/sync.ts`:

```ts
import express from 'express'
import { db } from '../supabase-client'
import { Sync, SyncClockError } from '../sync'
import { SyncRequestSchema } from '../sync-contracts'
import { authenticateToken, type AuthRequest } from '../middleware/auth'

const router = express.Router()

router.post('/', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = SyncRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    // Cloud is what hosting is sold as, so this is a boundary rather than a
    // failure: a free account's day is never hosted (TARGET.md, ADR-0012).
    // One row, not `Credits.getCreditSummary`, which runs five queries including
    // a month of usage logs. This gate runs on every exchange.
    const subscription = await db.getUserCreditSubscription(req.user.userId)
    if (!subscription?.active) {
      return res.status(403).json({
        error: 'Cloud is not active on this account.',
        reason: 'cloud_not_active',
      })
    }

    return res.json(await Sync.exchange(req.user.userId, parsed.data))
  } catch (error) {
    if (error instanceof SyncClockError) {
      return res.status(409).json({
        error: 'This device’s clock is too far ahead to sync safely.',
        reason: 'device_clock_ahead',
      })
    }
    console.error('Sync error:', error)
    return res.status(500).json({ error: 'Could not sync this day' })
  }
})

export { router as syncRoutes }
```

- [ ] **Step 5: Register it**

In `backend/src/index.ts`, beside the other route registrations (around line 137):

```ts
import { syncRoutes } from './routes/sync'
```

```ts
app.use('/api/sync', syncRoutes)
```

- [ ] **Step 6: Run the tests**

Run: `npm --prefix backend test -- tests/sync/endpoint.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 7: Assert the server keeps the id the device chose**

The duplication risk from client-generated ids has no test yet, and it is the same
failure that would have duplicated an entire account during sign-in. Create
`backend/tests/sync/service.test.ts`:

```ts
import { Sync } from '../../src/sync'
import { supabase } from '../../src/supabase-client'

const upsert = jest.fn().mockResolvedValue({ error: null })
const select = jest.fn()

jest.mock('../../src/supabase-client', () => ({
  supabase: { from: jest.fn() },
}))

const emptyPayload = {
  tasks: [], habitProgress: [], calorieEntries: [], calorieItems: [],
  weightEntries: [], workoutSessions: [], workoutPlans: [],
  workoutExerciseItems: [], achievementDefinitions: [], achievementEntries: [],
  settings: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  select.mockReturnValue({ eq: () => ({ gt: () => ({ data: [], error: null }) }) })
  ;(supabase.from as jest.Mock).mockReturnValue({ select, upsert })
})

describe('accepting what a device sent', () => {
  it('upserts on the id the device chose, so a replay is not a second row', async () => {
    await Sync.exchange('user-1', {
      since: null,
      changed: {
        ...emptyPayload,
        tasks: [{ id: 'chosen-by-the-device', title: 'A task', updated_at: '2026-08-23T10:00:00.000Z' }],
      },
    } as never)

    const [rows, options] = upsert.mock.calls[0]
    expect(rows[0].id).toBe('chosen-by-the-device')
    expect(options).toEqual({ onConflict: 'id' })
  })

  it('stamps the caller as the owner, whatever the device claimed', async () => {
    await Sync.exchange('user-1', {
      since: null,
      changed: {
        ...emptyPayload,
        tasks: [{ id: 'a', user_id: 'somebody-else', updated_at: '2026-08-23T10:00:00.000Z' }],
      },
    } as never)

    expect(upsert.mock.calls[0][0][0].user_id).toBe('user-1')
  })

  it('refuses a row from a clock that is far ahead, writing nothing', async () => {
    const ahead = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    await expect(Sync.exchange('user-1', {
      since: null,
      changed: { ...emptyPayload, tasks: [{ id: 'a', updated_at: ahead }] },
    } as never)).rejects.toThrow()

    expect(upsert).not.toHaveBeenCalled()
  })
})
```

Run: `npm --prefix backend test -- tests/sync/service.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 8: Run the whole backend suite**

Run: `npm --prefix backend test`
Expected: 749 existing + 16 new = 765 passing. If `POST /test/reset — HF_TEST_MODE guard` fails, re-run — it is a known flake across parallel workers.

- [ ] **Step 9: Commit**

```bash
git add backend/src/sync.ts backend/src/routes/sync.ts backend/src/index.ts backend/tests/sync/
git commit -m "feat: POST /sync exchanges a delta with a Cloud subscriber"
```

---

## Task 5: the device remembers where it got to

**Files:**
- Modify: `src/lib/local/store.ts`
- Modify: `src/lib/local/day.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe('the stored document')` block in `src/lib/local/day.test.ts`:

```ts
  it('remembers the watermark the server gave it', async () => {
    await createLocalTask(USER, { title: 'Anything', type: 'task', category: 'work', scheduledDate: TODAY })

    await recordSyncedAt(USER, '2026-08-23T12:00:00.000Z')

    assert.equal((await loadLocalDatabase(USER)).syncedAt, '2026-08-23T12:00:00.000Z')
  })

  it('starts with no watermark, so the first exchange sends everything', async () => {
    assert.equal((await loadLocalDatabase(USER)).syncedAt, null)
  })
```

Add `recordSyncedAt` to the imports from `./store`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lib/local/day.test.ts`
Expected: FAIL — `recordSyncedAt` is not exported.

- [ ] **Step 3: Add it to the document**

In `src/lib/local/store.ts`, add to `LocalDatabaseSchema` after `settings`:

```ts
  /**
   * The server's clock at the end of the last successful exchange, or null if
   * there has not been one. Stored beside the day because it is only meaningful
   * against this document — a fresh document has seen nothing.
   */
  syncedAt: z.string().nullable().default(null),
  /**
   * When settings last changed. They are stored as a patch object rather than
   * rows, so they carry no per-row timestamp and would otherwise never appear in
   * a delta — they would sync once on a first push and never again.
   */
  settingsUpdatedAt: z.string().nullable().default(null),
```

Add `syncedAt: null,` and `settingsUpdatedAt: null,` to `emptyLocalDatabase`. Stamp
the settings timestamp wherever settings are written — in
`src/lib/local/day.ts`, `updateLocalSettings` becomes:

```ts
export function updateLocalSettings(userId: string, patch: Partial<Settings>): Promise<Settings> {
  return mutateLocalDatabase(userId, (database) => {
    const next: LocalDatabase = {
      ...database,
      settings: { ...database.settings, ...patch },
      settingsUpdatedAt: new Date().toISOString(),
    }
    return { next, result: resolveLocalSettings(next) }
  })
}
```

Then export from `store.ts`:

```ts
export function recordSyncedAt(userId: string, syncedAt: string): Promise<void> {
  return mutateLocalDatabase(userId, (database) => ({
    next: { ...database, syncedAt },
    result: undefined,
  }))
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run test:unit`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/local/store.ts src/lib/local/day.test.ts
git commit -m "feat: the document remembers its sync watermark"
```

---

## Task 6: the client exchange

**Files:**
- Create: `src/lib/local/sync.ts`
- Create: `src/lib/local/sync.test.ts`
- Modify: `src/services/api.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/local/sync.test.ts`:

```ts
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { collectDelta, applyIncoming } from './sync'
import { emptyLocalDatabase, type LocalDatabase } from './store'

const base = (): LocalDatabase => emptyLocalDatabase('account-1')

const task = (over: Record<string, unknown> = {}) => ({
  id: 'task-1', user_id: 'account-1', title: 'A task', type: 'task', category: 'work',
  created_at: '2026-08-23T09:00:00.000Z', updated_at: '2026-08-23T09:00:00.000Z',
  ...over,
}) as unknown as LocalDatabase['tasks'][number]

describe('what the device sends', () => {
  it('sends everything when it has never synced', () => {
    const database = { ...base(), syncedAt: null, tasks: [task()] }

    const delta = collectDelta(database)

    assert.equal(delta.tasks.length, 1)
  })

  it('sends only what changed since the watermark', () => {
    const database = {
      ...base(),
      syncedAt: '2026-08-23T10:00:00.000Z',
      tasks: [
        task({ id: 'old', updated_at: '2026-08-23T09:00:00.000Z' }),
        task({ id: 'new', updated_at: '2026-08-23T11:00:00.000Z' }),
      ],
    }

    const delta = collectDelta(database)

    assert.deepEqual(delta.tasks.map((row) => row.id), ['new'])
  })

  it('sends a deletion, because it is a change like any other', () => {
    const database = {
      ...base(),
      syncedAt: '2026-08-23T10:00:00.000Z',
      tasks: [task({ deleted_at: '2026-08-23T11:00:00.000Z', updated_at: '2026-08-23T11:00:00.000Z' })],
    }

    assert.equal(collectDelta(database).tasks.length, 1)
  })

  it('sends nothing when nothing moved', () => {
    const database = { ...base(), syncedAt: '2026-08-23T10:00:00.000Z', tasks: [task()] }

    assert.equal(collectDelta(database).tasks.length, 0)
  })
})

describe('what the device does with the reply', () => {
  it('keeps the more recently changed of a pair', () => {
    const database = { ...base(), tasks: [task({ title: 'Device copy', updated_at: '2026-08-23T11:00:00.000Z' })] }

    const next = applyIncoming(database, {
      tasks: [task({ title: 'Server copy', updated_at: '2026-08-23T10:00:00.000Z' })],
    } as never)

    assert.equal(next.tasks.length, 1)
    assert.equal(next.tasks[0].title, 'Device copy')
  })

  it('takes a row it has never seen', () => {
    const next = applyIncoming(base(), { tasks: [task({ id: 'from-another-phone' })] } as never)

    assert.deepEqual(next.tasks.map((row) => row.id), ['from-another-phone'])
  })

  it('takes a deletion made on another device', () => {
    const database = { ...base(), tasks: [task()] }

    const next = applyIncoming(database, {
      tasks: [task({ deleted_at: '2026-08-23T11:00:00.000Z', updated_at: '2026-08-23T11:00:00.000Z' })],
    } as never)

    assert.ok(next.tasks[0].deleted_at)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lib/local/sync.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the exchange**

Create `src/lib/local/sync.ts`:

```ts
import SyncContracts from '../../../backend/src/sync-contracts'
import { loadLocalDatabase, mutateLocalDatabase, recordSyncedAt, type LocalDatabase } from './store'

const { SYNC_COLLECTIONS, changedAt, mergeRows } = SyncContracts

type Payload = Record<string, unknown[]>

/**
 * Everything this device changed since the server last saw it.
 *
 * A null watermark means nothing has been synced, so the delta is the whole day —
 * the same exchange, not a separate first-push mechanism.
 */
export function collectDelta(database: LocalDatabase): Payload {
  const since = database.syncedAt
  const delta: Payload = {}
  for (const collection of SYNC_COLLECTIONS) {
    const rows = (database[collection] ?? []) as { id: string }[]
    delta[collection] = since
      ? rows.filter((row) => changedAt(row) > since)
      : [...rows]
  }
  // Settings are one record with one timestamp, not rows, so they are compared
  // whole. Omitting them entirely would mean they synced on a first push and
  // never again.
  const settingsChanged = !since
    || (database.settingsUpdatedAt !== null && database.settingsUpdatedAt > since)
  ;(delta as Record<string, unknown>).settings = settingsChanged
    ? { ...database.settings, updated_at: database.settingsUpdatedAt }
    : null
  return delta
}

/**
 * Fold the server's reply into the document.
 *
 * The same `mergeRows` the server runs, so a row that loses here loses there too.
 */
export function applyIncoming(database: LocalDatabase, incoming: Payload): LocalDatabase {
  const next = { ...database } as unknown as Record<string, unknown>
  for (const collection of SYNC_COLLECTIONS) {
    const stored = (database[collection] ?? []) as { id: string }[]
    const arrived = (incoming[collection] ?? []) as { id: string }[]
    if (arrived.length === 0) continue
    next[collection] = mergeRows(stored, arrived)
  }
  return next as unknown as LocalDatabase
}

/**
 * Run one exchange.
 *
 * Offline is not a special case: the call fails, the watermark does not advance,
 * and the next exchange carries whatever accumulated. There is nothing to retry
 * and no queue to drain.
 */
export async function runSync(
  userId: string,
  exchange: (body: { since: string | null; changed: Payload }) => Promise<{ syncedAt: string; changed: Payload }>,
): Promise<void> {
  const database = await loadLocalDatabase(userId)
  const reply = await exchange({ since: database.syncedAt, changed: collectDelta(database) })

  await mutateLocalDatabase(userId, (current) => ({
    next: applyIncoming(current, reply.changed),
    result: undefined,
  }))
  await recordSyncedAt(userId, reply.syncedAt)
}
```

- [ ] **Step 4: Add the API call**

In `src/services/api.ts`, after `daySummaryService`:

```ts
export const syncService = {
  // Deliberately not routed through `onDevice`: this *is* the network half. A
  // device with no Cloud subscription gets a 403, which is a boundary rather than
  // a failure (ADR-0012).
  exchange: async (body: { since: string | null; changed: Record<string, unknown[]> }) => {
    const response = await api.post('/sync', body)
    return response.data as { syncedAt: string; changed: Record<string, unknown[]> }
  },
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:unit`
Expected: all passing, including the seven new ones.

- [ ] **Step 6: Run a whole account export through the whole path**

The spec asks for this by name, and it is the gap every device bug this week came
through: the tests all used rows the *device* creates, and every failure came from
rows the *server* creates. Append to `src/lib/local/adopt.test.ts`:

```ts
describe('a complete server export, end to end', () => {
  // Server rows for every collection, in the shapes the tables actually have —
  // snake_case, no updated_at on tasks, health carrying its own timestamps.
  const exported = {
    items: [{
      id: 'srv-task', user_id: 'account-1', title: 'From the server', type: 'task',
      category: 'work', completed: false, deleted_at: null, scheduled_date: '2026-08-23',
      created_at: '2026-08-20T09:00:00.000Z',
    }],
    habitProgress: [{
      id: 'srv-progress', habit_instance_id: 'srv-habit', user_id: 'account-1',
      amount: 10, note: null, created_at: '2026-08-20T09:00:00.000Z',
    }],
    settings: [{ user_id: 'account-1', week_starts_on: 1 }],
    health: {
      calorieEntries: [{
        id: 'srv-meal', user_id: 'account-1', date: '2026-08-23', name: 'Porridge',
        calories: 300, created_at: '2026-08-23T08:00:00.000Z',
        updated_at: '2026-08-23T08:00:00.000Z',
      }],
      weightEntries: [{
        id: 'srv-weight', user_id: 'account-1', date: '2026-08-23', weight_kg: 80,
        created_at: '2026-08-23T07:00:00.000Z', updated_at: '2026-08-23T07:00:00.000Z',
      }],
    },
  }

  it('imports, saves, reads back, and builds a day', async () => {
    setLocalStoreDriver(memoryDriver(null))

    const day = localDayFromExport('account-1', exported as never)
    await replaceLocalDay(day)

    const reloaded = await loadLocalDatabase('account-1')
    assert.equal(reloaded.tasks.length, 1)
    // The write that succeeded and could never be read back is the failure this
    // guards: every row has to survive the round trip, not just parse going in.
    assert.equal(LocalDatabaseSchema.safeParse(reloaded).success, true)

    const summary = await buildLocalDaySummary('account-1', '2026-08-23', 'UTC')
    assert.equal(summary.items.length, 1)
    assert.equal(summary.capacity.status, 'complete')
  })
})
```

Add `loadLocalDatabase`, `buildLocalDaySummary` and `setLocalStoreDriver` to the
imports if the file does not already have them.

Run: `npm run test:unit`
Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/local/sync.ts src/lib/local/sync.test.ts src/lib/local/adopt.test.ts src/services/api.ts
git commit -m "feat: the device half of the sync exchange"
```

---

## Task 7: run it at the right moments

**Files:**
- Create: `src/hooks/useCloudSync.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write the hook**

Create `src/hooks/useCloudSync.ts`:

```ts
import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { creditsService, syncService, DAY_SUMMARY_QUERY_KEY } from '../services/api'
import { runSync } from '../lib/local/sync'
import { localDayUser } from '../lib/local/services'

const AFTER_A_CHANGE_MS = 3_000

/**
 * Keep a Cloud subscriber's day and the server in step.
 *
 * Runs on open, on regaining a connection, and a few seconds after a change. There
 * is no queue: offline simply means the watermark does not advance, and the next
 * run carries whatever accumulated.
 */
export function useCloudSync() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const running = useRef(false)

  useEffect(() => {
    const userId = localDayUser()
    if (!user || !userId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const sync = async () => {
      if (running.current || cancelled) return
      running.current = true
      try {
        const summary = await creditsService.getSummary()
        if (!summary.subscription.active) return
        await runSync(userId, syncService.exchange)
        queryClient.invalidateQueries({ queryKey: DAY_SUMMARY_QUERY_KEY })
      } catch (error) {
        // A failed exchange changes nothing: the watermark did not move, so the
        // next one carries the same delta plus whatever has happened since.
        console.error('[sync] exchange failed:', error)
      } finally {
        running.current = false
      }
    }

    void sync()
    const onOnline = () => { void sync() }
    const onChange = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void sync() }, AFTER_A_CHANGE_MS)
    }

    window.addEventListener('online', onOnline)
    window.addEventListener('healthyflow:local-day-changed', onChange)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('healthyflow:local-day-changed', onChange)
    }
  }, [user, queryClient])
}
```

- [ ] **Step 2: Announce a local change from the one funnel**

In `src/lib/local/store.ts`, at the end of `mutateLocalDatabase`, after `loaded = next`:

```ts
  // Announced from the funnel every write already goes through, so no call site
  // can forget to — the mistake that has cost this codebase twice already.
  window.dispatchEvent(new Event('healthyflow:local-day-changed'))
```

- [ ] **Step 3: Use the hook**

In `src/App.tsx`, add the import and call it inside `App`, beside `useSettings`:

```tsx
import { useCloudSync } from './hooks/useCloudSync'
```

```tsx
  useCloudSync()
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useCloudSync.ts src/App.tsx src/lib/local/store.ts
git commit -m "feat: sync on open, on reconnect, and after a change"
```

---

## Task 8: verify, and true up the docs

**Files:**
- Modify: `CONTEXT.md`
- Modify: `HANDOFF.md`
- Modify: `LEDGER.md`

- [ ] **Step 1: Run every verification command**

```bash
npm run typecheck
npm --prefix backend run typecheck
npm run test:unit
npm --prefix backend test
npm run build
```

Expected: clean, clean, all passing, 762 passing, clean.

- [ ] **Step 2: Add the vocabulary**

In `CONTEXT.md`, under "Words that do not mean what they look like":

```markdown
**Sync watermark** — the server's clock at the end of the last successful
exchange, stored on the device. It answers "what have I already seen", and it is
deliberately *not* the device's clock: a skewed device would otherwise either miss
rows forever or re-send everything every time. Which of two edits was later is a
different question, and that one *is* answered by the device's `updated_at`.
```

- [ ] **Step 3: Update `HANDOFF.md`**

Replace the whole "The gap that keeps producing bugs: nothing uploads" section
with:

```markdown
## Cloud sync, and what it still leaves

A Cloud subscriber's day now syncs both ways: the device sends rows changed since
its watermark, the server returns rows changed since the same watermark, and both
sides merge with most-recently-changed-wins. Offline is not a special case — the
watermark does not advance and the next exchange carries whatever accumulated.

**A free registered account still has no backup**, deliberately: hosting is what
Cloud sells. Whoever ships the paywall copy should say so plainly, because people
otherwise discover it by losing a phone.

Two follow-ups this deliberately left:

- **The deletion job.** On lapse the hosted copy freezes, and the plan was to
  delete it after a grace period. Only the freeze is built. The deletion needs a
  scheduler, warning emails and a clock — and it is what bounds the storage cost
  that made a grace period preferable to keeping data forever.
- **Realtime.** A Supabase subscription becomes a nudge to run the same exchange,
  not a second code path. The pull was shaped as "everything since a watermark"
  specifically so this stays cheap.
```

- [ ] **Step 4: Prepend the `LEDGER.md` entry**

Follow the CLAUDE.md commit workflow: 2–4 sentences on what was accomplished and
where the project stands.

- [ ] **Step 5: Commit**

```bash
git add CONTEXT.md HANDOFF.md LEDGER.md
git commit -m "docs: a subscriber's day syncs"
```

---

## Out of scope

Named so nobody adds them mid-flight:

- **The deletion job** after the grace period. Needs a scheduler, warning emails and
  a clock. Must not be forgotten — the storage cost it bounds is why a grace period
  was chosen over keeping data forever.
- **Realtime.** A Supabase subscription becomes a nudge to run this same exchange.
- **Field-level conflict resolution.**
- **The web app syncing.** It has no local day.
- **What a subscriber sees while a sync is failing.** Open question in the spec.
