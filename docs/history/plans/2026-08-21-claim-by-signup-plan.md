# Claim by signup — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Guest can become an account holder — by email and password, Google, or Apple — without their day moving or their session breaking.

**Architecture:** One guarded `UPDATE` on the row the Guest already holds, so the `userId` never changes and the Local day stays keyed correctly. `POST /auth/claim` is authenticated: the token *is* the identity. No signup slot, no waitlist, no credits.

**Tech Stack:** Express + Zod + Supabase on the server; React + axios + `@tanstack/react-query` on the client; Jest/supertest for backend tests, `tsx --test` for frontend.

**Spec:** `docs/history/specs/2026-08-21-claim-by-signup-design.md`
**Decisions:** ADR-0012 (entry is open), ADR-0010 (session lifetime), ADR-0011 (the Local day)

---

## The correction this plan makes to the spec

The spec says "on success `localDayUser` resolves to the same id it already held, so the Local day is untouched." **That is not what the current code does.** The rule in `AuthContext.adoptUser` is:

```ts
setLocalDayUser(userData && isGuestSession(userData) ? userData.id : null)
```

`isGuestSession` is `email === null`. The instant Claim sets an email, that returns `false`, `localDayUser` becomes `null`, and the day flips to the server — where the user has nothing. **Claiming would appear to erase the day.**

The fix cannot be "always local" yet: an existing account holder signing in on a fresh device would then read an empty local document while their real data sits on the server. That is piece 3's job.

So this plan introduces one rule, in Task 6:

> **The day is local when the signed-in user is a Guest, or when this device is recorded as holding a Local day for them.**

The record is written once when a guest session starts. Because Claim never changes the `userId`, Claim itself does nothing to it — which is exactly the invariant the spec is built on, now actually true.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/supabase-client.ts` | **Modify** — add `claimGuestAccount`: the guarded `UPDATE`, returning the row or `null` |
| `backend/src/auth.ts` | **Modify** — add `Auth.claimGuestAccount`: identity resolution and the three ways in |
| `backend/src/routes/auth.ts` | **Modify** — add `POST /claim`: validate, call the service, return |
| `backend/tests/auth/claim.test.ts` | **Create** — the endpoint's tests |
| `src/services/api.ts` | **Modify** — `authService.claim` and `authService.claimWithProvider` |
| `src/lib/local/services.ts` | **Modify** — record which account this device holds a Local day for |
| `src/lib/local/ownership.test.ts` | **Create** — the client-level assertion the day survives Claim |
| `src/context/AuthContext.tsx` | **Modify** — `claimAccount`, and the corrected local-day rule |
| `src/pages/ClaimAccountPage.tsx` | **Create** — the screen |
| `src/App.tsx` | **Modify** — route it |
| `src/components/Layout.tsx` | **Modify** — the menu entry point |

---

## Task 1: The endpoint claims a Guest by email and password

**Files:**
- Create: `backend/tests/auth/claim.test.ts`
- Modify: `backend/src/supabase-client.ts`
- Modify: `backend/src/auth.ts`
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/auth/claim.test.ts`:

```ts
import request from 'supertest'
import jwt from 'jsonwebtoken'
import { app } from '../../src/index'
import { db } from '../../src/supabase-client'
import { Credits } from '../../src/credits'
import { Onboarding } from '../../src/onboarding'
import { Waitlist } from '../../src/waitlist'

jest.mock('../../src/supabase-client', () => ({
  db: {
    getUserById: jest.fn(),
    getUserByEmail: jest.fn(),
    getUserByGoogleSubject: jest.fn(),
    getUserByAppleSubject: jest.fn(),
    claimGuestAccount: jest.fn(),
  },
}))

jest.mock('../../src/credits', () => ({
  Credits: { grantSignupCredits: jest.fn() },
}))

jest.mock('../../src/onboarding', () => ({
  Onboarding: { seedNewUser: jest.fn() },
}))

jest.mock('../../src/waitlist', () => ({
  Waitlist: { authorizeSignup: jest.fn(), getSignupStatus: jest.fn() },
}))

const mockDb = db as jest.Mocked<typeof db>
const mockCredits = Credits as jest.Mocked<typeof Credits>
const mockOnboarding = Onboarding as jest.Mocked<typeof Onboarding>
const mockWaitlist = Waitlist as jest.Mocked<typeof Waitlist>

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

const guestRow = {
  id: 'guest-1',
  email: null,
  name: 'Guest',
  role: 'user' as const,
  signup_method: 'guest' as const,
}

const claimedRow = {
  id: 'guest-1',
  email: 'someone@example.com',
  name: 'Someone',
  role: 'user' as const,
  signup_method: 'password' as const,
}

const guestToken = () => jwt.sign({ userId: guestRow.id }, JWT_SECRET, { expiresIn: '365d' })

beforeEach(() => {
  jest.clearAllMocks()
  mockDb.getUserById.mockResolvedValue(guestRow as never)
  mockDb.getUserByEmail.mockResolvedValue(null as never)
  mockDb.claimGuestAccount.mockResolvedValue(claimedRow as never)
})

describe('POST /api/auth/claim', () => {
  it('converts the Guest row in place and returns an account session', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'Someone@Example.com ', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: 'guest-1',
      email: 'someone@example.com',
      authMethod: 'password',
    })
    expect(response.body.token).toEqual(expect.any(String))

    // The whole design rests on this: same row, same id, so the Local day on the
    // device is still keyed correctly the instant the write commits.
    const [userId, changes] = mockDb.claimGuestAccount.mock.calls[0]
    expect(userId).toBe('guest-1')
    expect(changes).toMatchObject({ email: 'someone@example.com', signup_method: 'password' })
    expect(changes.password_hash).toEqual(expect.any(String))
    expect(changes.password_hash).not.toBe('a-good-password')
  })

  it('issues an account-length session, not the guest year', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    const decoded = jwt.verify(response.body.token, JWT_SECRET) as { exp: number; iat: number }
    // Expiry is affordable again the moment there is a password to sign back in
    // with (ADR-0010). Seven days, not 365.
    expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60)
  })

  it('refuses an address that already has an account, changing nothing', async () => {
    mockDb.getUserByEmail.mockResolvedValue({ id: 'other-1' } as never)

    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'taken@example.com', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(409)
    expect(response.body.reason).toBe('email_taken')
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })

  it('requires a session', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(401)
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm --prefix backend test -- tests/auth/claim.test.ts`
Expected: FAIL — 404 rather than 200, because the route does not exist.

- [ ] **Step 3: Add the guarded update to the database facade**

In `backend/src/supabase-client.ts`, directly after `updateUserPassword` (around line 208), add:

```ts
  // Claim: a Guest's row becomes an account holder's, in place (ADR-0012).
  //
  // `.is('email', null)` is what makes "you must still be a Guest" atomic. A
  // check-then-act would let two concurrent claims both pass the check; here the
  // second matches no rows and the caller sees `null`. Email and signup_method
  // must move together or the users_guest_has_no_email CHECK rejects the write.
  async claimGuestAccount(userId: string, changes: {
    email: string
    password_hash: string
    name: string
    signup_method: 'password' | 'google' | 'apple'
    google_auth_subject?: string
    apple_auth_subject?: string
  }): Promise<AccountRow | null> {
    const { data, error } = await supabase
      .from('users')
      .update(changes)
      .eq('id', userId)
      .is('email', null)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data as AccountRow | null;
  },
```

- [ ] **Step 4: Add the service**

In `backend/src/auth.ts`, add above `export const Auth = {`:

```ts
const ClaimAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(120),
})
export type ClaimAccountInput = z.infer<typeof ClaimAccountSchema>

// Claim converts the row the caller already holds. It never creates a row and
// never deletes one, so every failure leaves the Guest a Guest with their day
// intact. No Waitlist.authorizeSignup and no public slot: entry is open
// (ADR-0012). No credit grant: credits are a purchase, and where the $1 taster
// sits is deliberately unplaced. No Onboarding.seedNewUser: it writes user
// settings, which are day data and live on the device.
async function claimGuestAccount(userId: string, rawInput: ClaimAccountInput) {
  const input = ClaimAccountSchema.parse(rawInput)
  const email = input.email.trim().toLowerCase()

  const existing = await db.getUserByEmail(email)
  if (existing) {
    throw new AuthFlowError(409, 'email_taken', 'That address already has a HealthyFlow account. Sign in instead.')
  }

  const claimed = await db.claimGuestAccount(userId, {
    email,
    password_hash: await bcrypt.hash(input.password, 10),
    name: input.name.trim(),
    signup_method: 'password',
  })
  if (!claimed) {
    throw new AuthFlowError(403, 'not_a_guest', 'This session already has an account.')
  }

  return appSession(claimed)
}
```

Then add `claimGuestAccount,` to the `Auth` object, beside `startGuestSession`.

- [ ] **Step 5: Add the route**

In `backend/src/routes/auth.ts`, add `authenticateToken` and `AuthRequest` to the imports from `'../middleware/auth'` if they are not already there, add `ClaimAccountInput` to the `../auth` import, and add this route directly after the `/guest` route:

```ts
// Claim. The token is the identity — no user id in the body, so a caller can
// only ever claim their own row.
router.post('/claim', authenticateToken, async (req: AuthRequest, res) => {
  const parsed = ClaimSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const session = await Auth.claimGuestAccount(req.user.userId, parsed.data as ClaimAccountInput)
    return res.json(session)
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return res.status(error.status).json({ error: error.message, reason: error.reason })
    }
    console.error('Claim error:', error)
    return res.status(500).json({ error: 'Could not create your account' })
  }
})
```

And add the schema beside `GuestSessionSchema` (around line 36):

```ts
const ClaimSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
})
```

- [ ] **Step 6: Run the tests**

Run: `npm --prefix backend test -- tests/auth/claim.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 7: Commit**

```bash
git add backend/src/supabase-client.ts backend/src/auth.ts backend/src/routes/auth.ts backend/tests/auth/claim.test.ts
git commit -m "feat: a Guest can claim their row as an account"
```

---

## Task 2: The guard holds, and Claim takes nothing it should not

**Files:**
- Modify: `backend/tests/auth/claim.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('POST /api/auth/claim')` block:

```ts
  it('refuses a second claim on a row that is no longer a Guest', async () => {
    // The guarded UPDATE matched no rows: someone else claimed it first, or this
    // session already has an account.
    mockDb.claimGuestAccount.mockResolvedValue(null as never)

    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    expect(response.status).toBe(403)
    expect(response.body.reason).toBe('not_a_guest')
  })

  it('takes no signup slot and no founding seat', async () => {
    await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    // Entry is open (ADR-0012). Both of these were previously true of every
    // account-creating path, so they are asserted rather than assumed.
    expect(mockWaitlist.authorizeSignup).not.toHaveBeenCalled()
    expect(mockCredits.grantSignupCredits).not.toHaveBeenCalled()
  })

  it('does not seed onboarding, because settings are day data', async () => {
    await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'a-good-password', name: 'Someone' })

    expect(mockOnboarding.seedNewUser).not.toHaveBeenCalled()
  })

  it('rejects a password too short to be one', async () => {
    const response = await request(app)
      .post('/api/auth/claim')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ email: 'someone@example.com', password: 'short', name: 'Someone' })

    expect(response.status).toBe(400)
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run them**

Run: `npm --prefix backend test -- tests/auth/claim.test.ts`
Expected: PASS — 8 tests. All four should already pass against Task 1's implementation; if `takes no signup slot` fails, the service is calling something it must not.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/auth/claim.test.ts
git commit -m "test: Claim takes no slot, no seat, no credits, and cannot run twice"
```

---

## Task 3: Claim with Google or Apple

**Files:**
- Modify: `backend/src/auth.ts`
- Modify: `backend/src/routes/auth.ts`
- Modify: `backend/tests/auth/claim.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/auth/claim.test.ts`, after the existing describe block:

```ts
describe('POST /api/auth/claim/:provider', () => {
  const providerRow = {
    id: 'guest-1',
    email: 'someone@gmail.com',
    name: 'Someone',
    role: 'user' as const,
    signup_method: 'google' as const,
  }

  beforeEach(() => {
    mockDb.getUserByGoogleSubject.mockResolvedValue(null as never)
    mockDb.getUserByAppleSubject.mockResolvedValue(null as never)
    mockDb.claimGuestAccount.mockResolvedValue(providerRow as never)
  })

  it('attaches a verified Google identity to the Guest row', async () => {
    const response = await request(app)
      .post('/api/auth/claim/google')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ accessToken: 'valid-google-token' })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({ id: 'guest-1', authMethod: 'google' })

    const [userId, changes] = mockDb.claimGuestAccount.mock.calls[0]
    expect(userId).toBe('guest-1')
    expect(changes).toMatchObject({
      email: 'someone@gmail.com',
      signup_method: 'google',
      google_auth_subject: 'supabase-user-1',
    })
  })

  it('refuses when that provider identity already belongs to an account', async () => {
    mockDb.getUserByGoogleSubject.mockResolvedValue({ id: 'other-1' } as never)

    const response = await request(app)
      .post('/api/auth/claim/google')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ accessToken: 'valid-google-token' })

    expect(response.status).toBe(409)
    expect(response.body.reason).toBe('identity_conflict')
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })

  it('surfaces an expired provider session rather than a generic failure', async () => {
    supabaseAuthMock.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'bad token' } })

    const response = await request(app)
      .post('/api/auth/claim/google')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ accessToken: 'expired-token' })

    expect(response.status).toBe(401)
    expect(response.body.reason).toBe('provider_session_invalid')
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })

  it('refuses when that address already belongs to an account', async () => {
    mockDb.getUserByEmail.mockResolvedValue({ id: 'other-1' } as never)

    const response = await request(app)
      .post('/api/auth/claim/apple')
      .set('Authorization', `Bearer ${guestToken()}`)
      .send({ accessToken: 'valid-apple-token' })

    expect(response.status).toBe(409)
    expect(response.body.reason).toBe('email_taken')
    expect(mockDb.claimGuestAccount).not.toHaveBeenCalled()
  })
})
```

This needs the Supabase auth client stubbed. Add to the top of the file, beside the other mocks:

```ts
const supabaseAuthMock = {
  getUser: jest.fn(),
  admin: { deleteUser: jest.fn() },
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: supabaseAuthMock,
  }),
}))
```

and give it its default inside the provider suite's `beforeEach`:

```ts
    supabaseAuthMock.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'supabase-user-1',
          email: 'someone@gmail.com',
          email_confirmed_at: '2026-08-21T00:00:00.000Z',
          app_metadata: { provider: 'google', providers: ['google', 'apple'] },
          user_metadata: { full_name: 'Someone' },
          identities: [{ provider: 'google' }, { provider: 'apple' }],
        },
      },
      error: null,
    })
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm --prefix backend test -- tests/auth/claim.test.ts`
Expected: FAIL — 404, the provider route does not exist.

- [ ] **Step 3: Add the provider service**

In `backend/src/auth.ts`, directly after `claimGuestAccount`, add:

```ts
// Claim with a verified provider identity. The resolution order is what keeps
// this safe: an identity or address that already belongs to an account is a
// refusal, never a merge — merging into an existing account is Sign in, which is
// a different operation with different consequences (CONTEXT.md).
async function claimGuestAccountWithProvider(
  userId: string,
  provider: AuthProvider,
  input: ProviderSessionInput,
) {
  const providerName = provider === 'google' ? 'Google' : 'Apple'
  const parsed = ProviderSessionSchema.parse(input)

  let authUser: SupabaseAuthUser
  try {
    const { data, error } = await supabase.auth.getUser(parsed.accessToken)
    if (error || !data.user) {
      throw new AuthFlowError(401, 'provider_session_invalid', `${providerName} sign-in expired. Please try again.`)
    }
    authUser = data.user
  } catch (error) {
    if (error instanceof AuthFlowError) throw error
    throw new AuthFlowError(503, 'provider_unavailable', `${providerName} sign-in is temporarily unavailable.`)
  }

  if (!isVerifiedProviderUser(authUser, provider) || !authUser.email) {
    throw new AuthFlowError(
      401,
      'provider_identity_invalid',
      `${providerName} did not provide a verified email address.`,
    )
  }

  const email = authUser.email.trim().toLowerCase()

  const bySubject = provider === 'google'
    ? await db.getUserByGoogleSubject(authUser.id)
    : await db.getUserByAppleSubject(authUser.id)
  if (bySubject) {
    throw new AuthFlowError(
      409,
      'identity_conflict',
      `That ${providerName} account is already linked to a HealthyFlow account.`,
    )
  }

  const byEmail = await db.getUserByEmail(email)
  if (byEmail) {
    throw new AuthFlowError(409, 'email_taken', 'That address already has a HealthyFlow account. Sign in instead.')
  }

  const claimed = await db.claimGuestAccount(userId, {
    // The guest row already carries an unguessable random password_hash from
    // startGuestSession, so nothing can sign in with it. Rewriting it with
    // another random value keeps the write shape identical for all three paths.
    password_hash: await bcrypt.hash(randomBytes(32).toString('base64url'), 10),
    email,
    name: displayName(authUser, email, parsed.displayName),
    signup_method: provider,
    ...(provider === 'google'
      ? { google_auth_subject: authUser.id }
      : { apple_auth_subject: authUser.id }),
  })
  if (!claimed) {
    throw new AuthFlowError(403, 'not_a_guest', 'This session already has an account.')
  }

  return appSession(claimed)
}
```

Add `claimGuestAccountWithProvider,` to the `Auth` object.

- [ ] **Step 4: Add the provider route**

In `backend/src/routes/auth.ts`, directly after the `/claim` route:

```ts
router.post('/claim/:provider', authenticateToken, async (req: AuthRequest, res) => {
  const provider = req.params.provider
  if (provider !== 'google' && provider !== 'apple') {
    return res.status(404).json({ error: 'Unknown provider' })
  }
  const parsed = ProviderSessionSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message })
  }

  try {
    const session = await Auth.claimGuestAccountWithProvider(req.user.userId, provider, parsed.data)
    return res.json(session)
  } catch (error) {
    if (error instanceof AuthFlowError) {
      return res.status(error.status).json({ error: error.message, reason: error.reason })
    }
    console.error('Provider claim error:', error)
    return res.status(500).json({ error: 'Could not create your account' })
  }
})
```

Add `ProviderSessionSchema` to the existing `../auth` import if it is not already there.

- [ ] **Step 5: Run the tests**

Run: `npm --prefix backend test -- tests/auth/claim.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 6: Run the whole backend suite**

Run: `npm --prefix backend test`
Expected: 737 existing + 12 new = 749 passing. If `POST /test/reset — HF_TEST_MODE guard` fails, re-run — it is a known flake across parallel workers.

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth.ts backend/src/routes/auth.ts backend/tests/auth/claim.test.ts
git commit -m "feat: claim a Guest row with Google or Apple"
```

---

## Task 4: The client can call it

**Files:**
- Modify: `src/services/api.ts`

- [ ] **Step 1: Add the service calls**

In `src/services/api.ts`, inside `authService`, directly after `startGuestSession`:

```ts
  // Claim. The Guest's own row becomes an account — same userId, so the Local
  // day on this device stays keyed correctly and nothing moves (ADR-0012).
  claim: async (email: string, password: string, name: string) => {
    const response = await api.post('/auth/claim', { email, password, name })
    return GuestSessionResponseSchema.parse(response.data)
  },

  claimWithProvider: async (provider: 'google' | 'apple', accessToken: string, displayName?: string) => {
    const response = await api.post(`/auth/claim/${provider}`, { accessToken, displayName })
    return GuestSessionResponseSchema.parse(response.data)
  },
```

`GuestSessionResponseSchema` is `{ user: SessionUserSchema, token: z.string().min(1) }`, which is exactly the claim response shape — reused rather than duplicated.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/services/api.ts
git commit -m "feat: authService.claim and claimWithProvider"
```

---

## Task 5: This device remembers whose day it holds

**Files:**
- Modify: `src/lib/local/services.ts`
- Create: `src/lib/local/ownership.test.ts`
- Modify: `package.json`

This is the correction described at the top of the plan. Without it, Claim appears to erase the day.

- [ ] **Step 1: Write the failing test**

Create `src/lib/local/ownership.test.ts`:

```ts
import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { forgetLocalDayOwner, holdsLocalDay, rememberLocalDayOwner } from './services'

// A minimal localStorage, because node has none.
function installStorage() {
  const values = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

beforeEach(installStorage)

describe('which account this device holds a day for', () => {
  // The regression this file exists for. `isGuestSession` is `email === null`,
  // so the moment Claim sets an email the old rule flipped the day to the server
  // — where a freshly claimed account has nothing. Claiming would have looked
  // exactly like erasing the day.
  it('still holds the day for an account that was claimed from a Guest', () => {
    rememberLocalDayOwner('guest-1')

    assert.equal(holdsLocalDay({ id: 'guest-1', email: null }), true)
    assert.equal(holdsLocalDay({ id: 'guest-1', email: 'someone@example.com' }), true)
  })

  it('holds the day for a Guest who has not written one yet', () => {
    assert.equal(holdsLocalDay({ id: 'guest-2', email: null }), true)
  })

  it('does not hold the day for an account this device has never seen', () => {
    rememberLocalDayOwner('guest-1')

    // An existing account holder signing in on a fresh device. Their day is on
    // the server until the download exists, so reading an empty local document
    // would look like loss.
    assert.equal(holdsLocalDay({ id: 'someone-else', email: 'other@example.com' }), false)
    assert.equal(holdsLocalDay(null), false)
  })

  it('forgets on request, for a deletion the user asked for by name', () => {
    rememberLocalDayOwner('guest-1')
    forgetLocalDayOwner()

    assert.equal(holdsLocalDay({ id: 'guest-1', email: 'someone@example.com' }), false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx tsx --test src/lib/local/ownership.test.ts`
Expected: FAIL — `does not provide an export named 'holdsLocalDay'`.

- [ ] **Step 3: Implement**

In `src/lib/local/services.ts`, replace the `setLocalDayUser` block with:

```ts
/** Which account's day this device is holding, or null when the day is hosted. */
let dayUserId: string | null = null

/**
 * Which account this device has written a Local day for.
 *
 * Held separately from the document because the axios request interceptor and
 * `AuthContext` both need the answer synchronously, and reading the document is
 * async. Written once when a guest session starts; Claim never touches it,
 * because Claim never changes the `userId`.
 */
const LOCAL_DAY_OWNER_KEY = 'healthyflow-local-day-owner-v1'

export function rememberLocalDayOwner(userId: string) {
  localStorage.setItem(LOCAL_DAY_OWNER_KEY, userId)
}

export function forgetLocalDayOwner() {
  localStorage.removeItem(LOCAL_DAY_OWNER_KEY)
}

/**
 * Whether this device holds the signed-in user's day.
 *
 * True for a Guest, whose day is local by definition even before they write one,
 * and true for an account this device already holds a day for — which is what
 * keeps a claimed account reading its own day instead of an empty server.
 *
 * False for an account this device has never seen. Their day is on the server
 * until the download exists, and reading an empty local document would look
 * exactly like losing it.
 */
export function holdsLocalDay(user: { id: string; email: string | null } | null): boolean {
  if (!user) return false
  if (user.email === null) return true
  return localStorage.getItem(LOCAL_DAY_OWNER_KEY) === user.id
}

export function setLocalDayUser(userId: string | null) {
  dayUserId = userId
}
```

- [ ] **Step 4: Run the test**

Run: `npx tsx --test src/lib/local/ownership.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Add the file to the test script**

`package.json`'s `test:unit` already globs `src/lib/local/*.test.ts`, so no change is needed. Confirm:

Run: `npm run test:unit`
Expected: 126 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/local/services.ts src/lib/local/ownership.test.ts
git commit -m "fix: a claimed account keeps reading the day on its own device"
```

---

## Task 6: AuthContext claims, and stops dropping the day

**Files:**
- Modify: `src/context/AuthContext.tsx`

- [ ] **Step 1: Use the new rule**

In `src/context/AuthContext.tsx`, change the import from `'../lib/local/services'`:

```ts
import {
  forgetLocalDayOwner,
  holdsLocalDay,
  rememberLocalDayOwner,
  setLocalDayUser,
} from '../lib/local/services'
```

Replace the body of `adoptUser`:

```ts
  const adoptUser = (userData: User | null) => {
    setLocalDayUser(holdsLocalDay(userData) ? userData!.id : null)
    setCurrentUser(userData)
  }
```

- [ ] **Step 2: Record ownership when a guest session starts**

In `startGuestSession`, directly after `writeSessionToken(token)`:

```ts
      rememberLocalDayOwner(userData.id)
```

- [ ] **Step 3: Forget it when the user deletes their account**

In `completeAccountDeletion`, beside the existing `clearLocalDay()` call:

```ts
    forgetLocalDayOwner()
```

- [ ] **Step 4: Add `claimAccount`**

Add above `startDemoSession`:

```ts
  /**
   * Become an account holder on the row you already hold.
   *
   * The `userId` does not change, so the Local day needs no migration, no upload
   * and no refetch — `adoptUser` resolves to the same id it already had, and
   * Today does not even flicker. Every failure throws with the session and the
   * day untouched.
   */
  const claimAccount = async (
    method: 'password' | AuthProvider,
    credentials: { email?: string; password?: string; name?: string; accessToken?: string },
  ) => {
    const { user: userData, token } = method === 'password'
      ? await authService.claim(credentials.email!, credentials.password!, credentials.name!)
      : await authService.claimWithProvider(method, credentials.accessToken!, credentials.name)

    writeSessionToken(token)
    identifyUser(userData)
    analytics.capture('signed_up', { method, source: 'guest' })
    adoptUser(userData)
    toast.success('Account created. Your day stayed right where it was.')
  }
```

Add `claimAccount: (method: 'password' | AuthProvider, credentials: { email?: string; password?: string; name?: string; accessToken?: string }) => Promise<void>` to `AuthContextType`, and `claimAccount,` to the provider value.

- [ ] **Step 5: Teach the analytics event about Claim**

`signed_up` currently requires `credit_cohort` and `onboarding_credits` and its
`source` is `'direct' | 'demo'`. Claim grants no credits and is a third source, so
in `src/lib/analytics/types.ts` change:

```ts
  signed_up: {
    method: 'password' | 'google' | 'apple'
    // Optional since ADR-0012: credits and account creation are separate
    // products, and Claim grants nothing.
    credit_cohort?: 'founding' | 'standard'
    onboarding_credits?: number
    // `guest` is the funnel this whole piece of work exists to open: someone who
    // used the app first and created an account afterwards.
    source?: 'direct' | 'demo' | 'guest'
    persona?: 'maya' | 'noam' | 'lina' | 'amir'
  }
```

Then simplify the capture in `claimAccount` to:

```ts
    analytics.capture('signed_up', { method, source: 'guest' })
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/context/AuthContext.tsx src/lib/analytics/types.ts
git commit -m "feat: claimAccount, and the day survives it"
```

---

## Task 7: The screen and the way in

**Files:**
- Create: `src/pages/ClaimAccountPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create the screen**

Create `src/pages/ClaimAccountPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Apple, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { beginNativeGoogleSignIn } from '../services/googleAuth'
import { beginAppleSignIn } from '../services/appleAuth'
import { isNativeIOS } from '../lib/native'

/** Why a claim failed, according to what came back. Never a guess. */
function claimMessage(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response
  if (!response) return 'Could not reach HealthyFlow. Check your connection and try again.'
  const message = response.data?.error
  if (typeof message === 'string' && message) return message
  return `Could not create your account (server said ${response.status ?? 'nothing'}).`
}

export default function ClaimAccountPage() {
  const { claimAccount } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<null | 'password' | 'google' | 'apple'>(null)

  const run = async (method: 'password' | 'google' | 'apple') => {
    setError('')
    setBusy(method)
    try {
      if (method === 'password') {
        await claimAccount('password', { email, password, name })
      } else if (method === 'google') {
        const { accessToken } = await beginNativeGoogleSignIn()
        await claimAccount('google', { accessToken })
      } else {
        // Apple returns a name only on the very first authorization, so it has
        // to be carried through here or the account is named after its email.
        const { accessToken, displayName } = await beginAppleSignIn()
        await claimAccount('apple', { accessToken, name: displayName })
      }
      navigate('/')
    } catch (claimError) {
      setError(claimMessage(claimError))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Create an account</h1>
        {/*
          The one thing worth saying, and it is true rather than reassuring: the
          day does not move, so nothing about it can go wrong here.
        */}
        <p className="mt-2 text-sm text-ink-muted">
          Your day stays exactly where it is, on this iPhone. An email is what
          makes it recoverable, and what lets you buy AI credits.
        </p>
      </header>

      <div className={isNativeIOS ? 'grid grid-cols-2 gap-3' : ''}>
        <button
          type="button"
          onClick={() => void run('google')}
          disabled={busy !== null}
          className="btn-secondary flex w-full items-center justify-center gap-2 px-3 py-3.5"
        >
          {busy === 'google' ? <LoadingSpinner size="sm" /> : null}
          <span className={isNativeIOS ? 'text-xs' : ''}>Continue with Google</span>
        </button>
        {isNativeIOS && (
          <button
            type="button"
            onClick={() => void run('apple')}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-control border border-ink bg-ink px-3 py-3.5 text-xs font-semibold text-page disabled:opacity-50"
          >
            {busy === 'apple' ? <LoadingSpinner size="sm" /> : <Apple className="h-5 w-5" />}
            <span>Continue with Apple</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => { event.preventDefault(); void run('password') }}
      >
        <div>
          <label htmlFor="claim-name" className="mb-2 block text-sm font-medium text-ink-soft">Your name</label>
          <input id="claim-name" className="input w-full" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="claim-email" className="mb-2 block text-sm font-medium text-ink-soft">Email address</label>
          <input id="claim-email" type="email" className="input w-full" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="claim-password" className="mb-2 block text-sm font-medium text-ink-soft">Password</label>
          <input id="claim-password" type="password" minLength={8} className="input w-full" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
        </div>

        {error && <p role="alert" className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">{error}</p>}

        <button type="submit" disabled={busy !== null} className="btn-primary flex w-full items-center justify-center gap-2 px-3 py-3.5">
          {busy === 'password' ? <LoadingSpinner size="sm" /> : <ArrowRight className="h-5 w-5" />}
          <span>Create account</span>
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Route it**

In `src/App.tsx`, add the import beside the other pages:

```tsx
import ClaimAccountPage from './pages/ClaimAccountPage'
```

and the route inside the authenticated `<Routes>`, beside `/settings/*`:

```tsx
          <Route path="/claim" element={<ClaimAccountPage />} />
```

- [ ] **Step 3: Add the menu entry**

In `src/components/Layout.tsx`, add `Link` to the `react-router-dom` import if absent and `UserPlus` to the `lucide-react` import. Then, in **both** places where `{canExitSession && (` appears, add directly before it:

```tsx
                {isGuest && (
                  <Link
                    to="/claim"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center space-x-2 w-full text-ink-muted hover:text-ink-soft transition-colors p-3 rounded-lg hover:bg-card/50"
                  >
                    <UserPlus className="w-5 h-5" />
                    <span className="font-medium">Create an account</span>
                  </Link>
                )}
```

In the desktop header instance, drop the `onClick` and use `p-2` and `text-sm` to match the buttons beside it.

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ClaimAccountPage.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: a Guest can reach Create an account from the menu"
```

---

## Task 8: Verify everything, and true up the docs

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

Expected: clean, clean, 126 passing, 749 passing, clean.

- [ ] **Step 2: Update `CONTEXT.md`**

Replace the "things that look built and are not" entry with:

```markdown
- **Sign in** (from a Guest) — a Guest cannot yet move to an account that already
  exists. It needs Health on the device first, because the download has nowhere
  to put it. Not designed. **Claim** is built.
```

- [ ] **Step 3: Update `HANDOFF.md`**

In "The order of what is left", mark piece 1 done and note that pieces 2 and 3 are unchanged.

- [ ] **Step 4: Prepend the `LEDGER.md` entry**

Follow the CLAUDE.md commit workflow: 2–4 sentences on what was accomplished and where the project stands.

- [ ] **Step 5: Commit**

```bash
git add CONTEXT.md HANDOFF.md LEDGER.md
git commit -m "docs: Claim is built"
```

---

## Out of scope

Named so nobody adds them mid-flight:

- **Sign in to an existing account.** Piece 3. Needs Health on the device.
- **Health on the device.** Piece 2.
- **The $1 credit grant.** Deliberately unplaced.
- **Removing `Waitlist.authorizeSignup` from `POST /auth/signup`.** ADR-0012 makes it wrong there too, but cold signup is not this plan's subject and changing it needs its own tests.
- **The login page's "N spots left" copy.** Now describes scarcity that no longer exists; belongs wherever Cloud is sold.
