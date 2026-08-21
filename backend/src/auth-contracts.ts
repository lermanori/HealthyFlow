import { z } from 'zod'

/**
 * The session contract, browser-safe.
 *
 * `auth.ts` reaches for bcrypt, jwt and Supabase, so the shapes it returns to the
 * client live here instead — the same split `task-contracts.ts` and
 * `push-contracts.ts` already use, and the same one the Chromium startup test
 * guards.
 */

export const AuthMethodSchema = z.enum(['password', 'google', 'apple', 'guest'])
export type AuthMethod = z.infer<typeof AuthMethodSchema>

/** Who a session belongs to. `email` is null for a Guest, and only for a Guest. */
export const SessionUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().nullable(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
  authMethod: AuthMethodSchema,
})
export type SessionUser = z.infer<typeof SessionUserSchema>

/**
 * What `GET /auth/verify` answers with.
 *
 * `token` is present when, and only when, the server re-issued the session — which
 * it does on every verified open for a Guest, whose token is the only key to their
 * row (ADR-0010). It is part of the contract rather than an undocumented extra
 * field precisely because a client that reads the identity and drops the token
 * turns the sliding year into a fixed fuse from account creation, and strands the
 * Guest on day 366 at a login screen they cannot pass.
 */
export const VerifiedSessionSchema = SessionUserSchema.extend({
  token: z.string().min(1).optional(),
})
export type VerifiedSession = z.infer<typeof VerifiedSessionSchema>

const AuthContracts = {
  AuthMethodSchema,
  SessionUserSchema,
  VerifiedSessionSchema,
}

export default AuthContracts
