/**
 * Email verification and password recovery challenges (#235).
 *
 * Both kinds share one set of rules, which is why they share one table and one
 * module: a random secret the server never stores, one use, an expiry, and
 * invalidation by a newer challenge of the same kind. Splitting them would
 * duplicate those rules and let them drift.
 *
 * Deliberately not reusing the admin reset route. That one takes
 * `ADMIN_TOKEN` and a new password directly; exposing it publicly would be a
 * password change with no proof of address at all.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const ChallengeKindSchema = z.enum(['verify_email', 'reset_password'])
export type ChallengeKind = z.infer<typeof ChallengeKindSchema>

/**
 * How long each kind stays usable.
 *
 * A reset link is the stronger capability — it changes the password — so it
 * lives for an hour. Verification only proves reachability and is often opened
 * later in the day, so a day is reasonable without being generous.
 */
export const CHALLENGE_LIFETIME_MS: Record<ChallengeKind, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
}

/**
 * The emailed secret, and what the database is allowed to know about it.
 *
 * 32 random bytes, url-safe. The row stores only a SHA-256 of it, so reading
 * the table gives no working link — which is the difference between a database
 * leak and an account takeover.
 *
 * SHA-256 rather than bcrypt on purpose: this is a 256-bit random value, not a
 * human-chosen password, so there is nothing for a slow hash to defend. Lookup
 * has to be by hash, and a slow hash would make that a table scan.
 */
export function issueChallengeToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashChallengeToken(token) }
}

export function hashChallengeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time compare, for the one place a hash is checked outside SQL. */
export function challengeTokenMatches(token: string, tokenHash: string): boolean {
  const provided = Buffer.from(hashChallengeToken(token), 'hex')
  const stored = Buffer.from(tokenHash, 'hex')
  if (provided.length !== stored.length) return false
  return timingSafeEqual(provided, stored)
}

export function challengeExpiry(kind: ChallengeKind, now = new Date()): string {
  return new Date(now.getTime() + CHALLENGE_LIFETIME_MS[kind]).toISOString()
}

export interface StoredChallenge {
  id: string
  user_id: string
  kind: ChallengeKind
  email: string
  expires_at: string
  consumed_at: string | null
  superseded_at: string | null
}

export type ChallengeCheck =
  | { state: 'usable'; challenge: StoredChallenge }
  | { state: 'expired' }
  | { state: 'already_used' }
  | { state: 'superseded' }
  | { state: 'unknown' }

/**
 * Whether a challenge may still be acted on.
 *
 * Each refusal is its own answer. "This link has already been used" and "this
 * link expired" send a person to different next steps, and collapsing them into
 * one message makes both unhelpful.
 */
export function checkChallenge(
  challenge: StoredChallenge | null,
  now = new Date(),
): ChallengeCheck {
  if (!challenge) return { state: 'unknown' }
  if (challenge.consumed_at !== null) return { state: 'already_used' }
  if (challenge.superseded_at !== null) return { state: 'superseded' }
  if (Date.parse(challenge.expires_at) <= now.getTime()) return { state: 'expired' }
  return { state: 'usable', challenge }
}

/**
 * The address as it is stored and compared.
 *
 * Case and surrounding space only. Gmail's dot and plus-alias rules are
 * deliberately not applied: they are Gmail's, not email's, and guessing them
 * would merge addresses that belong to different people. The existing account
 * lookups already lowercase, so this matches what is there rather than
 * introducing a second, cleverer rule.
 */
export function canonicalEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function challengeLink(baseUrl: string, kind: ChallengeKind, token: string): string {
  const path = kind === 'verify_email' ? 'verify-email' : 'reset-password'
  return `${baseUrl}/app/${path}?token=${encodeURIComponent(token)}`
}

/**
 * What a reset request tells the caller, whatever the truth is.
 *
 * Always the same, so the endpoint cannot be used to learn which addresses have
 * accounts. A provider failure is the one exception and is reported separately —
 * silence there would leave someone waiting for mail that was never sent.
 */
export const RESET_REQUEST_ACCEPTED =
  'If that address has an account, a reset link is on its way.'
