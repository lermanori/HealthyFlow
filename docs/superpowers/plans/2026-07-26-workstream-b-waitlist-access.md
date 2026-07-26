# Workstream B: Waitlist-Centred Access Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close public registration, capture demand on a waitlist, and give the owner two controlled ways in — individual invites and a capped public opening that starts at 10 slots.

**Architecture:** A `waitlist` table is the spine. `invites` rows hang off waitlist rows and carry a single-use token. A one-row `signup_access` settings table holds the public slot count, following the existing `ai_billing_settings` pattern. All logic lives in one deep module, `backend/src/waitlist.ts`; routes stay thin per CLAUDE.md. The slot claim is a Postgres function so the last slot cannot be double-claimed.

**Tech Stack:** Express + TypeScript, Zod, Supabase (Postgres), React + React Query, Jest + supertest.

**Source spec:** `docs/superpowers/specs/2026-07-26-launch-prep-design.md` section B.

**Depends on:** Workstream A (complete). The landing page now serves at `/` and the app at `/app`.

---

## Status (2026-07-26): code-complete, schema verified against real Postgres

All eleven tasks are implemented. The full backend suite passes at **387 tests / 53 suites**, and the frontend builds clean.

The migration was applied to a throwaway **Postgres 17** container and the two concurrency guarantees — the parts that only fail under real load — were exercised directly:

| Check | Result |
| --- | --- |
| 20 concurrent claims against **1** slot | exactly **1** granted, 19 refused; counter = 1 |
| 50 concurrent claims against **10** slots | exactly **10** granted; counter = 10 |
| 15 concurrent redemptions of **one** invite | exactly **1** returned a row |
| `public_slots_open = -1` | rejected by check constraint |
| `waitlist.status = 'bogus'` | rejected by check constraint |
| duplicate `waitlist.email` | rejected by unique index |
| second `signup_access` row | rejected by `CHECK (id)` |
| delete waitlist row | invites cascade away |
| delete redeeming user | invite survives, `redeemed_by_user_id` nulled |

**Still outstanding:** the migration has **not** been applied to production Supabase, so the HTTP-level loop (join → invite → redeem → `registered`) has not been exercised against the real backend. Applying DDL to production is the owner's action. Until it is applied, `GET /auth/signup-status` errors and the UI fails closed — login works, Create account is hidden — which is why `tests/e2e/onboarding.spec.ts` currently fails both specs.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260726120000_add_waitlist_access.sql` | Create: `waitlist`, `invites`, `signup_access`, slot-claim function |
| `backend/src/waitlist.ts` | Create: all waitlist, invite, and slot logic (deep module) |
| `backend/src/supabase-client.ts` | Modify: db accessors for the three new tables |
| `backend/src/routes/waitlist.ts` | Create: public join + admin management routes |
| `backend/src/routes/auth.ts` | Modify: gate `/signup`, add `/signup-status` |
| `backend/src/index.ts` | Modify: mount the waitlist router |
| `src/services/api.ts` | Modify: `waitlistService`, extend `authService` |
| `src/pages/LoginPage.tsx` | Modify: three-state signup panel |
| `src/components/admin/WaitlistPanel.tsx` | Create: admin waitlist table + slot control |
| `src/pages/TokenManagerPage.tsx` | Modify: render `<WaitlistPanel />` |
| `public/landing.html` | Modify: waitlist form + status-aware CTAs |

`WaitlistPanel` is a separate component rather than another section inside `TokenManagerPage.tsx`, which is already 567 lines across six sections. Adding a seventh inline would push it past 750.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260726120000_add_waitlist_access.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Waitlist-centred access control: registration is closed by default; the owner
-- opens it either by inviting a specific waitlist row or by opening N public slots.

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lowercased by the service layer so uniqueness is case-insensitive.
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'registered')),
  source TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  invited_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS waitlist_status_created_idx ON waitlist (status, created_at DESC);

CREATE TABLE IF NOT EXISTS invites (
  token TEXT PRIMARY KEY,
  waitlist_id UUID NOT NULL REFERENCES waitlist(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  redeemed_at TIMESTAMP WITH TIME ZONE,
  redeemed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS invites_waitlist_idx ON invites (waitlist_id);

-- One-row settings table, same shape as ai_billing_settings (id BOOLEAN PK = TRUE).
CREATE TABLE IF NOT EXISTS signup_access (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  public_slots_open INTEGER NOT NULL DEFAULT 10 CHECK (public_slots_open >= 0),
  public_slots_claimed INTEGER NOT NULL DEFAULT 0 CHECK (public_slots_claimed >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

INSERT INTO signup_access (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- Atomic slot claim. The WHERE guard and the increment happen in one statement, so
-- two concurrent signups cannot both take the last slot. Returns TRUE if claimed.
CREATE OR REPLACE FUNCTION claim_public_signup_slot()
RETURNS BOOLEAN AS $$
DECLARE
  claimed BOOLEAN;
BEGIN
  UPDATE signup_access
  SET public_slots_claimed = public_slots_claimed + 1,
      updated_at = NOW()
  WHERE id = TRUE AND public_slots_claimed < public_slots_open
  RETURNING TRUE INTO claimed;
  RETURN COALESCE(claimed, FALSE);
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Apply the migration**

Apply it in the Supabase SQL editor, or via the CLI if configured:

```bash
npx supabase db push
```

- [ ] **Step 3: Verify the tables and the claim function**

In the Supabase SQL editor:

```sql
SELECT public_slots_open, public_slots_claimed FROM signup_access;
SELECT claim_public_signup_slot();
SELECT public_slots_open, public_slots_claimed FROM signup_access;
```

Expected: `10, 0` → `true` → `10, 1`. Then reset the counter:

```sql
UPDATE signup_access SET public_slots_claimed = 0 WHERE id = TRUE;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260726120000_add_waitlist_access.sql
git commit -m "feat: add waitlist, invites, and signup_access tables"
```

---

## Task 2: Database accessors

**Files:**
- Modify: `backend/src/supabase-client.ts` (append to the `db` object, next to `getBillingSettings`)

- [ ] **Step 1: Add the accessors**

```ts
  async getWaitlistByEmail(email: string) {
    const { data, error } = await supabase
      .from('waitlist')
      .select('*')
      .eq('email', email)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async createWaitlistEntry(entry: {
    email: string
    name?: string | null
    source?: string | null
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
  }) {
    const { data, error } = await supabase
      .from('waitlist')
      .insert(entry)
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async listWaitlist(status?: string) {
    let query = supabase.from('waitlist').select('*').order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },

  async setWaitlistStatus(id: string, status: string, invitedAt?: string) {
    const patch: Record<string, unknown> = { status }
    if (invitedAt) patch.invited_at = invitedAt
    const { data, error } = await supabase
      .from('waitlist')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async deleteWaitlistEntry(id: string) {
    const { error } = await supabase.from('waitlist').delete().eq('id', id)
    if (error) throw error
  },

  async createInvite(invite: { token: string; waitlist_id: string }) {
    const { data, error } = await supabase
      .from('invites')
      .insert(invite)
      .select('*')
      .single()
    if (error) throw error
    return data
  },

  async getInviteByToken(token: string) {
    const { data, error } = await supabase
      .from('invites')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async redeemInvite(token: string, userId: string) {
    // Guarded on redeemed_at IS NULL so a token cannot be redeemed twice.
    const { data, error } = await supabase
      .from('invites')
      .update({ redeemed_at: new Date().toISOString(), redeemed_by_user_id: userId })
      .eq('token', token)
      .is('redeemed_at', null)
      .select('*')
      .maybeSingle()
    if (error) throw error
    return data
  },

  async listInvitesForWaitlist(waitlistIds: string[]) {
    if (waitlistIds.length === 0) return []
    const { data, error } = await supabase
      .from('invites')
      .select('*')
      .in('waitlist_id', waitlistIds)
    if (error) throw error
    return data ?? []
  },

  async getSignupAccess() {
    const { data, error } = await supabase
      .from('signup_access')
      .select('public_slots_open, public_slots_claimed, updated_at')
      .eq('id', true)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async updateSignupAccess(settings: { public_slots_open: number }) {
    const { data, error } = await supabase
      .from('signup_access')
      .update({ public_slots_open: settings.public_slots_open, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select('public_slots_open, public_slots_claimed, updated_at')
      .single()
    if (error) throw error
    return data
  },

  async claimPublicSignupSlot(): Promise<boolean> {
    const { data, error } = await supabase.rpc('claim_public_signup_slot')
    if (error) throw error
    return data === true
  },
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/supabase-client.ts
git commit -m "feat: add waitlist, invite, and signup-access db accessors"
```

---

## Task 3: The waitlist deep module

**Files:**
- Create: `backend/src/waitlist.ts`
- Test: `backend/tests/waitlist/waitlist.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { Waitlist } from '../../src/waitlist'
import { db } from '../../src/supabase-client'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getWaitlistByEmail: jest.fn(),
    createWaitlistEntry: jest.fn(),
    setWaitlistStatus: jest.fn(),
    createInvite: jest.fn(),
    getInviteByToken: jest.fn(),
    redeemInvite: jest.fn(),
    getSignupAccess: jest.fn(),
    claimPublicSignupSlot: jest.fn(),
  },
}))

const mockDb = db as jest.Mocked<typeof db>

beforeEach(() => jest.clearAllMocks())

describe('Waitlist.join', () => {
  it('lowercases the email before storing', async () => {
    mockDb.getWaitlistByEmail.mockResolvedValue(null)
    mockDb.createWaitlistEntry.mockResolvedValue({ id: 'w1', email: 'a@b.com', status: 'pending' })

    await Waitlist.join({ email: 'A@B.CoM', name: 'Alice' })

    expect(mockDb.createWaitlistEntry).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com' })
    )
  })

  it('is idempotent: an existing email does not create a second row', async () => {
    mockDb.getWaitlistByEmail.mockResolvedValue({ id: 'w1', email: 'a@b.com', status: 'pending' })

    const result = await Waitlist.join({ email: 'a@b.com' })

    expect(mockDb.createWaitlistEntry).not.toHaveBeenCalled()
    expect(result.alreadyJoined).toBe(true)
  })
})

describe('Waitlist.getSignupStatus', () => {
  it('reports open with the remaining count when slots are free', async () => {
    mockDb.getSignupAccess.mockResolvedValue({ public_slots_open: 10, public_slots_claimed: 3 })

    expect(await Waitlist.getSignupStatus()).toEqual({ mode: 'open', remaining: 7 })
  })

  it('reports waitlist when every slot is claimed', async () => {
    mockDb.getSignupAccess.mockResolvedValue({ public_slots_open: 10, public_slots_claimed: 10 })

    expect(await Waitlist.getSignupStatus()).toEqual({ mode: 'waitlist', remaining: 0 })
  })
})

describe('Waitlist.authorizeSignup', () => {
  it('allows a valid unredeemed invite without consuming a public slot', async () => {
    mockDb.getInviteByToken.mockResolvedValue({ token: 't1', waitlist_id: 'w1', redeemed_at: null })

    const result = await Waitlist.authorizeSignup('t1')

    expect(result).toEqual({ allowed: true, via: 'invite', inviteToken: 't1' })
    expect(mockDb.claimPublicSignupSlot).not.toHaveBeenCalled()
  })

  it('rejects an already-redeemed invite', async () => {
    mockDb.getInviteByToken.mockResolvedValue({ token: 't1', waitlist_id: 'w1', redeemed_at: '2026-07-26T00:00:00Z' })

    expect(await Waitlist.authorizeSignup('t1')).toEqual({ allowed: false, reason: 'invite_used' })
  })

  it('claims a public slot when no token is supplied', async () => {
    mockDb.claimPublicSignupSlot.mockResolvedValue(true)

    expect(await Waitlist.authorizeSignup(undefined)).toEqual({ allowed: true, via: 'public' })
  })

  it('refuses when the slot claim loses the race', async () => {
    mockDb.claimPublicSignupSlot.mockResolvedValue(false)

    expect(await Waitlist.authorizeSignup(undefined)).toEqual({ allowed: false, reason: 'closed' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm --prefix backend test -- tests/waitlist
```

Expected: FAIL — `Cannot find module '../../src/waitlist'`.

- [ ] **Step 3: Write the module**

```ts
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { db } from './supabase-client'

// Zod is the single source of truth for shapes (CLAUDE.md).
export const WaitlistJoinSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80).optional(),
  source: z.string().max(60).optional(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
})
export type WaitlistJoinInput = z.infer<typeof WaitlistJoinSchema>

export type SignupStatus = { mode: 'open' | 'waitlist'; remaining: number }

export type SignupAuthorization =
  | { allowed: true; via: 'invite'; inviteToken: string }
  | { allowed: true; via: 'public' }
  | { allowed: false; reason: 'closed' | 'invite_invalid' | 'invite_used' }

export const Waitlist = {
  async join(input: WaitlistJoinInput) {
    const email = input.email.trim().toLowerCase()
    const existing = await db.getWaitlistByEmail(email)
    // Idempotent by design: re-joining is not an error, and reporting "already on
    // the list" as a failure would leak membership to anyone who guesses an email.
    if (existing) return { entry: existing, alreadyJoined: true }

    const entry = await db.createWaitlistEntry({
      email,
      name: input.name ?? null,
      source: input.source ?? null,
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
    })
    return { entry, alreadyJoined: false }
  },

  async getSignupStatus(): Promise<SignupStatus> {
    const access = await db.getSignupAccess()
    const open = access?.public_slots_open ?? 0
    const claimed = access?.public_slots_claimed ?? 0
    const remaining = Math.max(open - claimed, 0)
    return { mode: remaining > 0 ? 'open' : 'waitlist', remaining }
  },

  async authorizeSignup(inviteToken?: string): Promise<SignupAuthorization> {
    if (inviteToken) {
      const invite = await db.getInviteByToken(inviteToken)
      if (!invite) return { allowed: false, reason: 'invite_invalid' }
      if (invite.redeemed_at) return { allowed: false, reason: 'invite_used' }
      return { allowed: true, via: 'invite', inviteToken }
    }

    // Atomic in Postgres: the guard and the increment are one statement, so the
    // last slot cannot be handed to two concurrent signups.
    const claimed = await db.claimPublicSignupSlot()
    return claimed ? { allowed: true, via: 'public' } : { allowed: false, reason: 'closed' }
  },

  async completeInviteSignup(inviteToken: string, userId: string) {
    const invite = await db.redeemInvite(inviteToken, userId)
    // redeemInvite is guarded on redeemed_at IS NULL, so a null result means another
    // request redeemed it first. Do not mark the waitlist row in that case.
    if (!invite) return null
    await db.setWaitlistStatus(invite.waitlist_id, 'registered')
    return invite
  },

  async createInviteFor(waitlistId: string) {
    const token = randomBytes(24).toString('base64url')
    const invite = await db.createInvite({ token, waitlist_id: waitlistId })
    await db.setWaitlistStatus(waitlistId, 'invited', new Date().toISOString())
    return invite
  },
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm --prefix backend test -- tests/waitlist
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/waitlist.ts backend/tests/waitlist
git commit -m "feat: add waitlist deep module with invite and slot authorization"
```

---

## Task 4: Gate the signup route

**Files:**
- Modify: `backend/src/routes/auth.ts:14-19` (schema), `:37-64` (handler)
- Test: `backend/tests/auth/signup.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/auth/signup.test.ts`. Extend the existing `jest.mock` for `../../src/supabase-client` with the new accessors, and mock the waitlist module:

```ts
jest.mock('../../src/waitlist', () => ({
  Waitlist: {
    authorizeSignup: jest.fn(),
    completeInviteSignup: jest.fn(),
  },
}))
```

Then, importing `Waitlist` from `../../src/waitlist` as `mockWaitlist`:

```ts
describe('POST /api/auth/signup — access gating', () => {
  it('403s with a waitlist payload when registration is closed', async () => {
    mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: false, reason: 'closed' })
    mockDb.getUserByEmail.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password1', name: 'Alice' })

    expect(res.status).toBe(403)
    expect(res.body.reason).toBe('closed')
    expect(mockDb.createUser).not.toHaveBeenCalled()
  })

  it('allows signup with a valid invite and redeems it', async () => {
    mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: true, via: 'invite', inviteToken: 't1' })
    mockDb.getUserByEmail.mockResolvedValue(null)
    mockDb.createUser.mockResolvedValue({ id: 'user-1', email: 'new@example.com', name: 'Alice' })

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password1', name: 'Alice', invite: 't1' })

    expect(res.status).toBe(200)
    expect(mockWaitlist.completeInviteSignup).toHaveBeenCalledWith('t1', 'user-1')
  })

  it('403s on an already-redeemed invite', async () => {
    mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: false, reason: 'invite_used' })
    mockDb.getUserByEmail.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'new@example.com', password: 'password1', name: 'Alice', invite: 't1' })

    expect(res.status).toBe(403)
    expect(res.body.reason).toBe('invite_used')
  })
})
```

The existing tests in this file must also set `mockWaitlist.authorizeSignup.mockResolvedValue({ allowed: true, via: 'public' })` in `beforeEach`, or they will fail once the gate exists.

- [ ] **Step 2: Run to verify failure**

```bash
npm --prefix backend test -- tests/auth/signup
```

Expected: FAIL — the closed case returns 200 because no gate exists yet.

- [ ] **Step 3: Add the gate**

Extend `SignupSchema` in `backend/src/routes/auth.ts`:

```ts
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  invite: z.string().min(1).optional(),
})
```

Import the module at the top of the file:

```ts
import { Waitlist } from '../waitlist'
```

Then in the handler, after the duplicate-email check and **before** `bcrypt.hash`:

```ts
    // Access gate: a valid invite always passes; otherwise a public slot must be
    // claimed. Checked after the duplicate-email check so a returning user does
    // not burn a slot, and before user creation so a refusal creates nothing.
    const authorization = await Waitlist.authorizeSignup(parsed.data.invite)
    if (!authorization.allowed) {
      return res.status(403).json({
        error: 'Registration is currently closed.',
        reason: authorization.reason,
      })
    }
```

And after the user is created, before issuing the token:

```ts
    if (authorization.via === 'invite') {
      await Waitlist.completeInviteSignup(authorization.inviteToken, user.id)
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --prefix backend test -- tests/auth
```

Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/auth.ts backend/tests/auth/signup.test.ts
git commit -m "feat: gate signup behind invites and the public slot cap"
```

---

## Task 5: Public status and waitlist-join routes

**Files:**
- Create: `backend/src/routes/waitlist.ts`
- Modify: `backend/src/index.ts` (mount the router)
- Test: `backend/tests/waitlist/routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import request from 'supertest'
import { app } from '../../src/index'
import { Waitlist } from '../../src/waitlist'

jest.mock('../../src/waitlist', () => ({
  Waitlist: { join: jest.fn(), getSignupStatus: jest.fn() },
  WaitlistJoinSchema: jest.requireActual('../../src/waitlist').WaitlistJoinSchema,
}))

const mockWaitlist = Waitlist as jest.Mocked<typeof Waitlist>

beforeEach(() => jest.clearAllMocks())

describe('POST /api/waitlist', () => {
  it('accepts a new email → 200', async () => {
    mockWaitlist.join.mockResolvedValue({ entry: { id: 'w1' }, alreadyJoined: false } as never)

    const res = await request(app).post('/api/waitlist').send({ email: 'a@b.com', name: 'Alice' })

    expect(res.status).toBe(200)
    expect(res.body.joined).toBe(true)
  })

  it('returns 200 (not 409) for a duplicate email', async () => {
    mockWaitlist.join.mockResolvedValue({ entry: { id: 'w1' }, alreadyJoined: true } as never)

    const res = await request(app).post('/api/waitlist').send({ email: 'a@b.com' })

    expect(res.status).toBe(200)
  })

  it('rejects an invalid email → 400', async () => {
    const res = await request(app).post('/api/waitlist').send({ email: 'nope' })

    expect(res.status).toBe(400)
    expect(mockWaitlist.join).not.toHaveBeenCalled()
  })
})

describe('GET /api/auth/signup-status', () => {
  it('returns mode and remaining without exposing the waitlist', async () => {
    mockWaitlist.getSignupStatus.mockResolvedValue({ mode: 'open', remaining: 7 })

    const res = await request(app).get('/api/auth/signup-status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ mode: 'open', remaining: 7 })
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm --prefix backend test -- tests/waitlist/routes
```

Expected: FAIL with 404 — the routes do not exist.

- [ ] **Step 3: Write the router**

`backend/src/routes/waitlist.ts`:

```ts
import express from 'express'
import rateLimit from 'express-rate-limit'
import { Waitlist, WaitlistJoinSchema } from '../waitlist'

const router = express.Router()

// Same shape as the signup limiter: this endpoint is public and unauthenticated.
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
})

router.post('/', joinLimiter, async (req, res) => {
  const parsed = WaitlistJoinSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    await Waitlist.join(parsed.data)
    // Always the same response whether or not the email was already present, so
    // the endpoint cannot be used to test whether someone is on the list.
    return res.json({ joined: true })
  } catch (error) {
    console.error('Waitlist join error:', error)
    return res.status(500).json({ error: 'Could not join the waitlist' })
  }
})

export default router
```

Add to `backend/src/routes/auth.ts`, above the `/signup` route:

```ts
// Public: lets the landing page and LoginPage pick between the signup form and
// the waitlist form. Deliberately exposes no invite or waitlist data.
router.get('/signup-status', async (_req, res) => {
  try {
    return res.json(await Waitlist.getSignupStatus())
  } catch (error) {
    console.error('Signup status error:', error)
    return res.status(500).json({ error: 'Could not read signup status' })
  }
})
```

Mount the router in `backend/src/index.ts` alongside the other `app.use('/api/...')` calls:

```ts
app.use('/api/waitlist', waitlistRouter)
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --prefix backend test -- tests/waitlist
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/waitlist.ts backend/src/routes/auth.ts backend/src/index.ts backend/tests/waitlist/routes.test.ts
git commit -m "feat: add public waitlist join and signup-status endpoints"
```

---

## Task 6: Admin routes

**Files:**
- Modify: `backend/src/routes/waitlist.ts`
- Test: `backend/tests/waitlist/admin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import request from 'supertest'
import { app } from '../../src/index'

describe('admin waitlist routes', () => {
  it('rejects unauthenticated access to the waitlist list', async () => {
    const res = await request(app).get('/api/waitlist/admin/entries')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated slot changes', async () => {
    const res = await request(app).patch('/api/waitlist/admin/slots').send({ publicSlotsOpen: 25 })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify failure**

```bash
npm --prefix backend test -- tests/waitlist/admin
```

Expected: FAIL with 404.

- [ ] **Step 3: Add the admin routes**

Append to `backend/src/routes/waitlist.ts`, importing the existing middleware and `z`:

```ts
import { z } from 'zod'
import { authenticateToken, requireAdminRole } from '../middleware/auth'
import { db } from '../supabase-client'

const SlotsSchema = z.object({ publicSlotsOpen: z.number().int().min(0).max(10_000) })
const AddEmailSchema = z.object({ email: z.string().email(), name: z.string().max(80).optional() })

router.get('/admin/entries', authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const entries = await db.listWaitlist(status)
    const invites = await db.listInvitesForWaitlist(entries.map((e: { id: string }) => e.id))
    const access = await db.getSignupAccess()
    res.json({ entries, invites, access })
  } catch (error) {
    console.error('Waitlist list error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/admin/entries', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = AddEmailSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    // Reuses the public join path so manually added people are ordinary waitlist
    // rows — one mechanism for both "signed up" and "someone I know".
    const { entry } = await Waitlist.join({ ...parsed.data, source: 'admin' })
    res.json({ entry })
  } catch (error) {
    console.error('Waitlist add error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.post('/admin/entries/:id/invite', authenticateToken, requireAdminRole, async (req, res) => {
  try {
    const invite = await Waitlist.createInviteFor(req.params.id)
    res.json({ invite })
  } catch (error) {
    console.error('Waitlist invite error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.delete('/admin/entries/:id', authenticateToken, requireAdminRole, async (req, res) => {
  try {
    await db.deleteWaitlistEntry(req.params.id)
    res.json({ deleted: true })
  } catch (error) {
    console.error('Waitlist delete error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})

router.patch('/admin/slots', authenticateToken, requireAdminRole, async (req, res) => {
  const parsed = SlotsSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message })
  try {
    const access = await db.updateSignupAccess({ public_slots_open: parsed.data.publicSlotsOpen })
    res.json({ access })
  } catch (error) {
    console.error('Waitlist slots error:', error)
    res.status(500).json({ error: 'Database error' })
  }
})
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm --prefix backend test -- tests/waitlist
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/waitlist.ts backend/tests/waitlist/admin.test.ts
git commit -m "feat: add admin waitlist management and slot control routes"
```

---

## Task 7: Frontend API service

**Files:**
- Modify: `src/services/api.ts` (near `authService`, line 331)

- [ ] **Step 1: Add the service methods**

```ts
export const waitlistService = {
  join: async (input: { email: string; name?: string; source?: string }) => {
    const response = await api.post('/waitlist', input)
    return response.data as { joined: boolean }
  },
  signupStatus: async () => {
    const response = await api.get('/auth/signup-status')
    return response.data as { mode: 'open' | 'waitlist'; remaining: number }
  },
  adminEntries: async (status?: string) => {
    const response = await api.get('/waitlist/admin/entries', { params: status ? { status } : {} })
    return response.data
  },
  adminAdd: async (input: { email: string; name?: string }) => {
    const response = await api.post('/waitlist/admin/entries', input)
    return response.data
  },
  adminInvite: async (id: string) => {
    const response = await api.post(`/waitlist/admin/entries/${id}/invite`)
    return response.data as { invite: { token: string } }
  },
  adminRemove: async (id: string) => {
    const response = await api.delete(`/waitlist/admin/entries/${id}`)
    return response.data
  },
  adminSetSlots: async (publicSlotsOpen: number) => {
    const response = await api.patch('/waitlist/admin/slots', { publicSlotsOpen })
    return response.data
  },
}
```

Extend `authService.signup` to carry an invite token:

```ts
  signup: async (email: string, password: string, name: string, invite?: string) => {
    const response = await api.post('/auth/signup', { email, password, name, invite })
    return response.data
  },
```

- [ ] **Step 2: Thread the invite through AuthContext**

In `src/context/AuthContext.tsx`, widen the signature at line 20 and line 90:

```ts
  signup: (email: string, password: string, name: string, invite?: string) => Promise<void>
```

```ts
  const signup = async (email: string, password: string, name: string, invite?: string) => {
```

and pass `invite` through to `authService.signup(email, password, name, invite)`.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/api.ts src/context/AuthContext.tsx
git commit -m "feat: add waitlist API service and invite-aware signup"
```

---

## Task 8: LoginPage three-state panel

**Files:**
- Modify: `src/pages/LoginPage.tsx:9-33` (state), `:123-138` (mode toggle), `:141-233` (form)

- [ ] **Step 1: Read the signup status and the invite token**

Add near the other `useState` calls:

```tsx
  const [signupStatus, setSignupStatus] = useState<{ mode: 'open' | 'waitlist'; remaining: number } | null>(null)
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite') ?? undefined)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistJoined, setWaitlistJoined] = useState(false)

  useEffect(() => {
    waitlistService.signupStatus().then(setSignupStatus).catch(() => setSignupStatus(null))
  }, [])

  // An invite always opens the form; otherwise the public slot count decides.
  const signupAllowed = Boolean(inviteToken) || signupStatus?.mode === 'open'
```

- [ ] **Step 2: Hide the Create account tab when signup is closed**

Wrap the "Create account" button at line 131 so it only renders when `signupAllowed`, and force `mode` back to `'login'` if the status arrives as closed while the signup tab is selected:

```tsx
  useEffect(() => {
    if (signupStatus && !signupAllowed && mode === 'signup') setMode('login')
  }, [signupStatus, signupAllowed, mode])
```

- [ ] **Step 3: Pass the invite token on submit**

In `handleSubmit`, change the signup branch:

```tsx
        await signup(email, password, name, inviteToken)
```

- [ ] **Step 4: Add the scarcity note and the waitlist form**

Below the mode toggle, render one of three things:

```tsx
  {inviteToken && (
    <p className="mt-3 text-sm text-cyan-400">You've been invited — create your account below.</p>
  )}

  {!inviteToken && signupStatus?.mode === 'open' && (
    <p className="mt-3 text-sm text-cyan-400">
      {signupStatus.remaining} {signupStatus.remaining === 1 ? 'spot' : 'spots'} left
    </p>
  )}

  {!inviteToken && signupStatus?.mode === 'waitlist' && (
    <div className="mt-4 rounded-xl border border-line p-4 text-left">
      {waitlistJoined ? (
        <p className="text-sm text-cyan-400">You're on the list. We'll email you when a spot opens.</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            await waitlistService.join({ email: waitlistEmail, source: 'login-page' })
            setWaitlistJoined(true)
          }}
        >
          <label htmlFor="waitlist-email" className="block text-sm font-medium text-ink-soft mb-2">
            Registration is closed — join the waitlist
          </label>
          <input
            id="waitlist-email"
            type="email"
            required
            value={waitlistEmail}
            onChange={(e) => setWaitlistEmail(e.target.value)}
            className="input-field"
            placeholder="you@example.com"
          />
          <button type="submit" className="btn-primary mt-3 w-full">Join the waitlist</button>
        </form>
      )}
    </div>
  )}
```

Import `waitlistService` from `../services/api`.

- [ ] **Step 5: Typecheck and verify in the browser**

```bash
npx tsc --noEmit
```

Then via `preview_start`, load `/app` with slots open and confirm the spots-left note; set slots to 0 in Supabase and reload to confirm the waitlist form; load `/app?invite=<token>` and confirm the invited note plus a working signup form. Use `read_page` for each.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "feat: render invited, open, and waitlist states on the login page"
```

---

## Task 9: Admin waitlist panel

**Files:**
- Create: `src/components/admin/WaitlistPanel.tsx`
- Modify: `src/pages/TokenManagerPage.tsx`

- [ ] **Step 1: Build the panel**

`src/components/admin/WaitlistPanel.tsx` — a self-contained component using React Query, matching the card/heading style of the existing Token Manager sections (`<h2 className="text-lg font-semibold text-ink">`):

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { waitlistService } from '../../services/api'

const WAITLIST_KEY = ['admin', 'waitlist'] as const

export default function WaitlistPanel() {
  const queryClient = useQueryClient()
  const [newEmail, setNewEmail] = useState('')
  const [slots, setSlots] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: WAITLIST_KEY,
    queryFn: () => waitlistService.adminEntries(),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: WAITLIST_KEY })

  const addEntry = useMutation({
    mutationFn: () => waitlistService.adminAdd({ email: newEmail }),
    onSuccess: () => { setNewEmail(''); invalidate() },
  })

  const invite = useMutation({
    mutationFn: (id: string) => waitlistService.adminInvite(id),
    onSuccess: (result) => {
      const url = `${window.location.origin}/app?invite=${result.invite.token}`
      navigator.clipboard.writeText(url)
      toast.success('Invite link copied')
      invalidate()
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => waitlistService.adminRemove(id),
    onSuccess: invalidate,
  })

  const saveSlots = useMutation({
    mutationFn: () => waitlistService.adminSetSlots(slots ?? 0),
    onSuccess: () => { toast.success('Slots updated'); invalidate() },
  })

  if (isLoading) return <div className="card"><p className="text-ink-muted">Loading waitlist…</p></div>

  const access = data?.access
  const claimed = access?.public_slots_claimed ?? 0
  const open = access?.public_slots_open ?? 0

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-ink">Waitlist</h2>

      <div className="mt-4 flex items-center gap-3">
        <label htmlFor="slots" className="text-sm text-ink-soft">Public slots open</label>
        <input
          id="slots"
          type="number"
          min={0}
          className="input-field w-24"
          value={slots ?? open}
          onChange={(e) => setSlots(Number(e.target.value))}
        />
        <button className="btn-primary" onClick={() => saveSlots.mutate()}>Save</button>
        <span className="text-sm text-ink-muted">{claimed} claimed · {Math.max(open - claimed, 0)} remaining</span>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="email"
          className="input-field flex-1"
          placeholder="Add someone you know"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <button className="btn-ghost" onClick={() => addEntry.mutate()}>Add</button>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted">
            <th className="py-2">Email</th><th>Status</th><th>Joined</th><th />
          </tr>
        </thead>
        <tbody>
          {(data?.entries ?? []).map((entry: { id: string; email: string; status: string; created_at: string }) => (
            <tr key={entry.id} className="border-t border-line">
              <td className="py-2 text-ink">{entry.email}</td>
              <td className="text-ink-soft">{entry.status}</td>
              <td className="text-ink-muted">{new Date(entry.created_at).toLocaleDateString()}</td>
              <td className="text-right">
                <button className="btn-ghost mr-2" onClick={() => invite.mutate(entry.id)}>Invite</button>
                <button className="btn-ghost" onClick={() => remove.mutate(entry.id)}>Remove</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Render it in the Token Manager**

Import and place `<WaitlistPanel />` in `src/pages/TokenManagerPage.tsx`, directly after the "Subscription Pricing" section (which ends before the "Admin Inbox" heading at line 340).

- [ ] **Step 3: Typecheck and verify in the browser**

```bash
npx tsc --noEmit
```

Log in as an admin, open `/app/token-manager`, and confirm via `read_page`: the Waitlist section renders, adding an email inserts a row, Invite copies a link and flips the row to `invited`, and changing the slot count persists across a reload.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/WaitlistPanel.tsx src/pages/TokenManagerPage.tsx
git commit -m "feat: add admin waitlist panel to the token manager"
```

---

## Task 10: Landing page waitlist form and status-aware CTAs

**Files:**
- Modify: `public/landing.html` (hero CTAs, pricing CTAs, new waitlist form, script block at :926)

- [ ] **Step 1: Add the waitlist form markup**

Insert a form into the pricing section, after the plans grid and before the closing `</div>` of `.wrap`, replacing the existing `.pricing-note` paragraph at line 878:

```html
      <form class="waitlist-form reveal" id="waitlist-form">
        <label for="waitlist-email">Registration is invite-only right now. Join the waitlist:</label>
        <div class="waitlist-row">
          <input id="waitlist-email" type="email" required placeholder="you@example.com" />
          <button class="btn btn-primary" type="submit">Join the waitlist</button>
        </div>
        <p class="waitlist-msg" id="waitlist-msg" role="status"></p>
      </form>
```

- [ ] **Step 2: Wire it up, and make the CTAs status-aware**

Append to the existing `<script>` block at the end of `public/landing.html`:

```js
    // The landing page is static and cross-origin to the API, so this needs the
    // landing origin in the backend's CORS allowlist.
    const API_BASE = 'https://healthyflow-production.up.railway.app/api';

    // Swap CTA wording based on real availability — scarcity that is actually true.
    fetch(`${API_BASE}/auth/signup-status`)
      .then((r) => r.json())
      .then((status) => {
        if (status.mode === 'open' && status.remaining > 0) {
          document.querySelectorAll('a.btn-primary[href="/app"]').forEach((el) => {
            el.textContent = `Start Free — ${status.remaining} spots left`;
          });
        } else {
          document.querySelectorAll('a.btn-primary[href="/app"]').forEach((el) => {
            el.textContent = 'Join the waitlist';
            el.setAttribute('href', '#waitlist-form');
          });
        }
      })
      .catch(() => { /* leave the default CTA text in place */ });

    const waitlistForm = document.getElementById('waitlist-form');
    waitlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('waitlist-msg');
      const params = new URLSearchParams(location.search);
      try {
        const res = await fetch(`${API_BASE}/waitlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('waitlist-email').value,
            source: 'landing',
            utmSource: params.get('utm_source') || undefined,
            utmMedium: params.get('utm_medium') || undefined,
            utmCampaign: params.get('utm_campaign') || undefined,
          }),
        });
        if (!res.ok) throw new Error('failed');
        msg.textContent = "You're on the list. We'll be in touch.";
        if (window.posthog) window.posthog.capture('waitlist_submitted', { source: 'landing' });
      } catch (_err) {
        msg.textContent = 'Something went wrong — please try again.';
      }
    });
```

- [ ] **Step 3: Add the landing origin to the backend CORS allowlist**

Find the `cors(...)` configuration in `backend/src/index.ts` and add the production landing origin (`https://healthyflow.app` or the current Netlify domain) plus `http://localhost:5173` for local testing. Without this the form fails silently in the browser — the single most likely way this task ships broken.

- [ ] **Step 4: Style the form**

Add to the `<style>` block, following the existing `.plan` card conventions:

```css
    .waitlist-form { max-width: 520px; margin: 36px auto 0; text-align: center; }
    .waitlist-form label { display: block; color: var(--text-dim); font-size: 15px; margin-bottom: 12px; }
    .waitlist-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .waitlist-row input {
      flex: 1 1 240px;
      background: rgba(11, 17, 32, 0.7);
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      padding: 13px 18px;
      color: var(--text);
      font-family: var(--font-body);
      font-size: 16px;
    }
    .waitlist-msg { margin-top: 12px; font-size: 14px; color: var(--cyan-bright); min-height: 20px; }
```

- [ ] **Step 5: Verify in the browser**

Via `preview_start`, load `/`, submit the form with a test email, and confirm through `read_network_requests` that `POST /api/waitlist` returns 200 and the success message renders. Then confirm the row exists in Supabase.

- [ ] **Step 6: Commit**

```bash
git add public/landing.html backend/src/index.ts
git commit -m "feat: add landing waitlist form and availability-aware CTAs"
```

---

## Task 11: Full verification

- [ ] **Step 1: Run the backend suite**

```bash
npm --prefix backend test
```

Expected: all suites pass, including the extended signup tests.

- [ ] **Step 2: Run the e2e suite against a baseline**

```bash
HF_E2E_WEB_PORT=5199 HF_E2E_API_PORT=3099 npx playwright test --reporter=line
```

Compare against the Workstream A result (15 failed / 47 passed, all pre-existing flake). Any *new* failure is caused by this workstream. Note that `tests/e2e/onboarding.spec.ts` signs up a new user and will now hit the gate — it needs either an invite token or an open slot in the test database.

- [ ] **Step 3: Manual end-to-end pass**

With slots at 0: `/` shows "Join the waitlist" → submitting adds a row → `/app` shows the waitlist form and no Create account tab. In Token Manager, invite that row → open the copied link → the signup form appears → completing it flips the row to `registered` and does not change the slot count. Then set slots to 2 and confirm `/` reads "2 spots left" and public signup works.

- [ ] **Step 4: Update the ledger and commit**

Prepend a dated entry to `LEDGER.md` per the CLAUDE.md commit workflow.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Landing form fails silently cross-origin | CORS allowlist entry in Task 10 Step 3; verified via `read_network_requests` |
| Two users claim the last slot | `claim_public_signup_slot()` guards and increments in one statement |
| An invite token is redeemed twice | `redeemInvite` is guarded on `redeemed_at IS NULL` and returns null on loss |
| Duplicate waitlist signups leak membership | `join` is idempotent and the route always returns the same response |
| `onboarding.spec.ts` breaks against the new gate | Called out explicitly in Task 11 Step 2 |
| Email case mismatch creates duplicate rows | Service layer lowercases before lookup and insert |

## Out of scope

Stripe or automated billing, sending the invite emails (the owner copies the link and sends it themselves), the day-thesis copy rewrite and `$9` pricing (Workstream D), and image/OG work (Workstream E).
