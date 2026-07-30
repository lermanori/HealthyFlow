import { registerPlugin } from '@capacitor/core'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isNativeIOS } from '../lib/native'

type AppleSignInResult = {
  identityToken: string
  nonce: string
  email?: string
  givenName?: string
  familyName?: string
}

interface AppleSignInPlugin {
  signIn(): Promise<AppleSignInResult>
}

const AppleSignIn = registerPlugin<AppleSignInPlugin>('AppleSignIn')

let client: SupabaseClient | null = null

export class AppleSignInError extends Error {
  constructor(
    public readonly reason: 'cancelled' | 'provider_error' | 'session_invalid' | 'not_configured',
    message: string,
  ) {
    super(message)
    this.name = 'AppleSignInError'
  }
}

function getClient() {
  if (client) return client
  const url = import.meta.env.VITE_SUPABASE_URL
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !publishableKey) {
    throw new AppleSignInError(
      'not_configured',
      'Apple sign-in is not configured yet. Use email and password for now.',
    )
  }

  client = createClient(url, publishableKey, {
    auth: {
      detectSessionInUrl: false,
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return client
}

function fullName(result: AppleSignInResult) {
  return [result.givenName, result.familyName]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 120)
}

export async function beginAppleSignIn() {
  if (!isNativeIOS) {
    throw new AppleSignInError(
      'not_configured',
      'Apple sign-in is available in the HealthyFlow iOS app.',
    )
  }

  let credential: AppleSignInResult
  try {
    credential = await AppleSignIn.signIn()
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === 'apple_sign_in_cancelled') {
      throw new AppleSignInError('cancelled', 'Apple sign-in was cancelled. No changes were made.')
    }
    throw new AppleSignInError(
      'provider_error',
      'Apple could not complete sign-in. Please try again.',
    )
  }

  try {
    const authClient = getClient()
    const { data, error } = await authClient.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: credential.nonce,
    })
    if (error || !data.session?.access_token) {
      throw error ?? new Error('Missing Supabase Auth session')
    }

    // Apple only supplies the person's name during the first authorization.
    // Store it before HealthyFlow's backend reads the Supabase user profile.
    const name = fullName(credential)
    if (name) {
      const { error: updateError } = await authClient.auth.updateUser({
        data: { full_name: name },
      })
      if (updateError) {
        console.warn('[auth] Apple profile name could not be copied to Supabase metadata:', updateError)
      }
    }

    return {
      accessToken: data.session.access_token,
      displayName: name || undefined,
    }
  } catch (error) {
    if (error instanceof AppleSignInError) throw error
    throw new AppleSignInError(
      'session_invalid',
      'Apple sign-in did not return a valid session. Please try again.',
    )
  }
}

export async function clearAppleSession() {
  if (!client) return
  try {
    await client.auth.signOut({ scope: 'local' })
  } catch {
    // HealthyFlow's own session is independent from this short-lived exchange.
  }
}
