import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const STORAGE_KEY = 'healthyflow-google-oauth'
const PENDING_KEY = 'healthyflow-google-oauth-pending'
const PENDING_MAX_AGE_MS = 30 * 60 * 1000

type PendingGoogleOAuth = {
  invite?: string
  returnTo?: string
  startedAt: number
}

let client: SupabaseClient | null = null

export class GoogleOAuthCallbackError extends Error {
  constructor(
    public readonly reason: 'cancelled' | 'provider_error' | 'session_invalid' | 'not_configured',
    message: string,
  ) {
    super(message)
    this.name = 'GoogleOAuthCallbackError'
  }
}

function getConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY
  return { url, publishableKey }
}

function getClient() {
  if (client) return client
  const { url, publishableKey } = getConfig()
  if (!url || !publishableKey) {
    throw new GoogleOAuthCallbackError(
      'not_configured',
      'Google sign-in is not configured yet. Use email and password for now.',
    )
  }

  client = createClient(url, publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: false,
      // OAuth may leave an installed mobile PWA and return through the system
      // browser. localStorage keeps the PKCE verifier and invitation available
      // across that handoff; the Supabase session is removed after exchange.
      storage: window.localStorage,
      storageKey: STORAGE_KEY,
    },
  })
  return client
}

function readPending(): PendingGoogleOAuth | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as PendingGoogleOAuth
    if (
      typeof pending.startedAt !== 'number' ||
      Date.now() - pending.startedAt > PENDING_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(PENDING_KEY)
      return null
    }
    return pending
  } catch {
    window.localStorage.removeItem(PENDING_KEY)
    return null
  }
}

export function getPendingGoogleInvite() {
  return readPending()?.invite
}

export function getPendingGoogleReturnTo() {
  return readPending()?.returnTo
}

export function isGoogleOAuthCallback() {
  const params = new URLSearchParams(window.location.search)
  return params.get('oauth') === 'callback'
}

export async function beginGoogleOAuth(invite?: string, returnTo?: string) {
  window.localStorage.setItem(PENDING_KEY, JSON.stringify({
    invite,
    returnTo,
    startedAt: Date.now(),
  } satisfies PendingGoogleOAuth))

  try {
    const { error } = await getClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/app?oauth=callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) throw error
  } catch (error) {
    window.localStorage.removeItem(PENDING_KEY)
    if (error instanceof GoogleOAuthCallbackError) throw error
    throw new GoogleOAuthCallbackError(
      'provider_error',
      'Could not start Google sign-in. Please check your connection and try again.',
    )
  }
}

export async function completeGoogleOAuthCallback() {
  const params = new URLSearchParams(window.location.search)
  const providerError = params.get('error')
  const providerErrorCode = params.get('error_code')
  if (providerError || providerErrorCode) {
    if (providerError === 'access_denied' || providerErrorCode === 'access_denied') {
      throw new GoogleOAuthCallbackError(
        'cancelled',
        'Google sign-in was cancelled. No changes were made.',
      )
    }
    throw new GoogleOAuthCallbackError(
      'provider_error',
      'Google could not complete sign-in. Please try again.',
    )
  }

  const code = params.get('code')
  if (!code) {
    throw new GoogleOAuthCallbackError(
      'session_invalid',
      'Google sign-in did not return a valid session. Please try again.',
    )
  }

  try {
    const { data, error } = await getClient().auth.exchangeCodeForSession(code)
    if (error || !data.session?.access_token) {
      throw error ?? new Error('Missing Supabase Auth session')
    }
    return {
      accessToken: data.session.access_token,
      invite: getPendingGoogleInvite(),
      returnTo: getPendingGoogleReturnTo(),
    }
  } catch {
    throw new GoogleOAuthCallbackError(
      'session_invalid',
      'Google sign-in expired or was already used. Please try again.',
    )
  }
}

export async function getCurrentGoogleAccessToken() {
  try {
    const { data, error } = await getClient().auth.getSession()
    if (error || !data.session?.access_token) return null
    return data.session.access_token
  } catch {
    return null
  }
}

export async function clearGoogleOAuth({ keepInvite = false }: { keepInvite?: boolean } = {}) {
  const invite = keepInvite ? getPendingGoogleInvite() : undefined
  try {
    await getClient().auth.signOut({ scope: 'local' })
  } catch {
    // A provider cancellation has no Supabase session to clear.
  }
  window.localStorage.removeItem(PENDING_KEY)
  window.localStorage.removeItem(`${STORAGE_KEY}-code-verifier`)
  window.localStorage.removeItem(STORAGE_KEY)
  return invite
}

export function replaceOAuthCallbackUrl(invite?: string, returnTo?: string) {
  if (returnTo) {
    const requested = new URL(returnTo, window.location.origin)
    if (
      requested.origin === window.location.origin &&
      requested.pathname === '/app/oauth/authorize'
    ) {
      window.history.replaceState({}, '', `${requested.pathname}${requested.search}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
      return
    }
  }
  const next = new URL('/app', window.location.origin)
  if (invite) next.searchParams.set('invite', invite)
  window.history.replaceState({}, '', `${next.pathname}${next.search}`)
}
