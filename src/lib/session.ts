import AuthContracts, { type SessionUser } from '../../backend/src/auth-contracts'

const { SessionUserSchema, VerifiedSessionSchema } = AuthContracts

export type { SessionUser }

/**
 * The session token, and the one place that knows where it lives.
 *
 * A Guest has no email and no password, so this token is the only key to their
 * row — their credits today, their day once it can be claimed (ADR-0010). That
 * makes *where* it is stored a durability decision rather than a detail, so every
 * read and write funnels through here and the storage behind it can be replaced
 * without every caller learning about it.
 */

export const SESSION_TOKEN_KEY = 'token'

export type SessionTokenStore = {
  read: () => string | null
  write: (token: string) => void
  clear: () => void
}

const browserStorageTokenStore: SessionTokenStore = {
  read: () => localStorage.getItem(SESSION_TOKEN_KEY),
  write: (token) => localStorage.setItem(SESSION_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(SESSION_TOKEN_KEY),
}

let tokenStore: SessionTokenStore = browserStorageTokenStore

/**
 * Replace where the session token is kept.
 *
 * The store is deliberately synchronous: the axios request interceptor reads the
 * token on every call and cannot await. A durable backing store that is async —
 * the iOS Keychain, which survives app deletion, is the one this exists for — is
 * read once at start-up into a store that answers from memory and writes through.
 */
export function setSessionTokenStore(store: SessionTokenStore) {
  tokenStore = store
}

export function readSessionToken(): string | null {
  return tokenStore.read()
}

export function writeSessionToken(token: string) {
  tokenStore.write(token)
}

export function clearSessionToken() {
  tokenStore.clear()
}

/**
 * The last identity the server confirmed.
 *
 * A Guest's day is on this device and the app is supposed to open without a
 * network (`TARGET.md`). Verifying the session needs one — so when the server
 * cannot be reached, this is what the app opens as. It is a cache of something
 * already proved, never a substitute for proving it: a server that answers and
 * *rejects* still ends the session.
 */
const SESSION_USER_KEY = 'healthyflow-session-user-v1'

export function rememberSessionUser(user: SessionUser) {
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
}

export function forgetSessionUser() {
  localStorage.removeItem(SESSION_USER_KEY)
}

export function readRememberedSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(SESSION_USER_KEY)
  if (!raw) return null
  try {
    return SessionUserSchema.parse(JSON.parse(raw))
  } catch {
    // Unreadable means it cannot be trusted as an identity, and an identity is
    // not something to guess at. Treat it as absent.
    return null
  }
}

/**
 * Whether a failed verify actually ended the session.
 *
 * A server that answered and refused is an answer. No response at all is the
 * network being absent, which for a locally-held day must change nothing.
 */
export function endedTheSession(error: unknown): boolean {
  return Boolean((error as { response?: unknown } | null)?.response)
}

export type AppliedSession = {
  user: SessionUser
  /** The re-issued token, if the server sent one. Already persisted. */
  renewedToken: string | null
}

/**
 * Read a `GET /auth/verify` response, persisting a re-issued session token.
 *
 * The persistence happens here rather than at the call sites because dropping it
 * is silent: the app keeps working for a year and then bounces a Guest to a login
 * screen with no email and no password to pass it. Callers that manage the token
 * themselves get it back so they can store the fresh one instead of the one they
 * verified with.
 */
export function applyVerifiedSession(raw: unknown): AppliedSession {
  const { token, ...user } = VerifiedSessionSchema.parse(raw)
  if (token) writeSessionToken(token)
  rememberSessionUser(user)
  return { user, renewedToken: token ?? null }
}

/** A Guest is an account with no email, and that is the whole test. */
export function isGuestSession(user: Pick<SessionUser, 'email'> | null | undefined): boolean {
  return Boolean(user) && user!.email === null
}
