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

  it('persists UTM attribution so ad spend can be tied to conversions', async () => {
    mockDb.getWaitlistByEmail.mockResolvedValue(null)
    mockDb.createWaitlistEntry.mockResolvedValue({ id: 'w1' })

    await Waitlist.join({ email: 'a@b.com', utmSource: 'instagram', utmCampaign: 'launch-1' })

    expect(mockDb.createWaitlistEntry).toHaveBeenCalledWith(
      expect.objectContaining({ utm_source: 'instagram', utm_campaign: 'launch-1' })
    )
  })
})

describe('Waitlist.getSignupStatus', () => {
  it('reports open with the remaining count when slots are free', async () => {
    mockDb.getSignupAccess.mockResolvedValue({ public_slots_open: 10, public_slots_claimed: 3, updated_at: '2026-07-26T00:00:00Z' })

    expect(await Waitlist.getSignupStatus()).toEqual({ mode: 'open', remaining: 7 })
  })

  it('reports waitlist when every slot is claimed', async () => {
    mockDb.getSignupAccess.mockResolvedValue({ public_slots_open: 10, public_slots_claimed: 10, updated_at: '2026-07-26T00:00:00Z' })

    expect(await Waitlist.getSignupStatus()).toEqual({ mode: 'waitlist', remaining: 0 })
  })

  it('never reports a negative remaining count', async () => {
    mockDb.getSignupAccess.mockResolvedValue({ public_slots_open: 2, public_slots_claimed: 5, updated_at: '2026-07-26T00:00:00Z' })

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

  it('rejects an unknown invite token', async () => {
    mockDb.getInviteByToken.mockResolvedValue(null)

    expect(await Waitlist.authorizeSignup('nope')).toEqual({ allowed: false, reason: 'invite_invalid' })
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

describe('Waitlist.completeInviteSignup', () => {
  it('marks the waitlist row registered when redemption wins', async () => {
    mockDb.redeemInvite.mockResolvedValue({ token: 't1', waitlist_id: 'w1' })

    await Waitlist.completeInviteSignup('t1', 'user-1')

    expect(mockDb.setWaitlistStatus).toHaveBeenCalledWith('w1', 'registered')
  })

  it('does not touch the waitlist row when another request redeemed first', async () => {
    mockDb.redeemInvite.mockResolvedValue(null)

    expect(await Waitlist.completeInviteSignup('t1', 'user-1')).toBeNull()
    expect(mockDb.setWaitlistStatus).not.toHaveBeenCalled()
  })
})

describe('Waitlist.createInviteFor', () => {
  it('generates a token and flips the row to invited', async () => {
    mockDb.createInvite.mockResolvedValue({ token: 'generated', waitlist_id: 'w1' })

    await Waitlist.createInviteFor('w1')

    const [call] = mockDb.createInvite.mock.calls
    expect(call[0].waitlist_id).toBe('w1')
    expect(call[0].token.length).toBeGreaterThanOrEqual(24)
    expect(mockDb.setWaitlistStatus).toHaveBeenCalledWith('w1', 'invited', expect.any(String))
  })
})
