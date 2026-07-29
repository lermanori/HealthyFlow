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
  | { allowed: false; reason: 'closed' | 'invite_invalid' | 'invite_used' | 'invite_expired' }

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
      if (new Date(invite.expires_at).getTime() <= Date.now()) {
        return { allowed: false, reason: 'invite_expired' }
      }
      return { allowed: true, via: 'invite', inviteToken }
    }

    // Atomic in Postgres: the guard and the increment are one statement, so the
    // last slot cannot be handed to two concurrent signups.
    const claimed = await db.claimPublicSignupSlot()
    return claimed ? { allowed: true, via: 'public' } : { allowed: false, reason: 'closed' }
  },

  async completeInviteSignup(inviteToken: string, userId: string) {
    let invite = await db.redeemInvite(inviteToken, userId)
    // A response can be lost after redemption. Treat a retry by the same user as
    // success, while continuing to reject a token redeemed by anyone else.
    if (!invite) {
      const existing = await db.getInviteByToken(inviteToken)
      if (existing?.redeemed_by_user_id === userId) invite = existing
    }
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
