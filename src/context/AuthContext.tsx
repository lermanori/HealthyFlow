import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accountService, authService } from '../services/api'
import { analytics } from '../lib/analytics'
import {
  clearSessionToken,
  isGuestSession,
  readSessionToken,
  writeSessionToken,
  type SessionUser,
} from '../lib/session'
import {
  clearDemoAcquisition,
  readDemoAcquisition,
  type DemoPersonaId,
} from '../demoPersonas'
import toast from 'react-hot-toast'
import {
  detachNativePushToken,
  syncNativePushToken,
} from '../lib/push'
import { clearTodayWidget } from '../lib/widget'
import {
  clearLocalDay,
  loadLocalDatabase,
  localDayExists,
  replaceLocalDay,
  resetLocalStore,
} from '../lib/local/store'
import { adoptAccountDay, countLocalDay, localDayFromExport, type AdoptionChoice } from '../lib/local/adopt'
import {
  forgetLocalDayOwner,
  holdsLocalDay,
  rememberLocalDayOwner,
  setLocalDayUser,
} from '../lib/local/services'

// The identity a session carries. `email` is null for a Guest, and only for a
// Guest — the whole test for one is the absence of an email.
type User = SessionUser

type AuthProvider = 'google' | 'apple'

/** What signing in would do, worked out before anything is written. */
export type SignInPreview = {
  session: { user: User; token: string }
  accountDay: Awaited<ReturnType<typeof localDayFromExport>>
  onDevice: ReturnType<typeof countLocalDay> | null
  fromAccount: ReturnType<typeof countLocalDay>
  deviceDay: Awaited<ReturnType<typeof loadLocalDatabase>> | null
}

/** The analytics enum is narrower than the session's; anything else is a password. */
const method_ = (authMethod: string): 'password' | 'google' | 'apple' =>
  authMethod === 'google' || authMethod === 'apple' ? authMethod : 'password'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithProvider: (
    provider: AuthProvider,
    accessToken: string,
    invite?: string,
    displayName?: string,
  ) => Promise<void>
  startGuestSession: () => Promise<void>
  previewSignIn: (
    method: 'password' | AuthProvider,
    credentials: { email?: string; password?: string; accessToken?: string },
  ) => Promise<SignInPreview>
  completeSignIn: (preview: SignInPreview, choice: AdoptionChoice) => Promise<void>
  claimAccount: (
    method: 'password' | AuthProvider,
    credentials: { email?: string; password?: string; name?: string; accessToken?: string },
  ) => Promise<void>
  startDemoSession: (persona: DemoPersonaId) => Promise<void>
  leaveDemoSession: () => Promise<boolean>
  signup: (email: string, password: string, name: string, invite?: string) => Promise<void>
  logout: () => void
  completeAccountDeletion: () => void
  isDemoSession: boolean
  isGuest: boolean
  hasDemoReturnSession: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const LEGACY_DEMO_EMAIL = 'demo@healthyflow.com'
const DEMO_RETURN_TOKEN_KEY = 'healthyflow-demo-return-token-v1'

// A Guest has no email, so they are never a demo persona: a persona is seeded,
// shared and disposable, and a Guest's day is their own.
function isDemoEmail(email: string | null) {
  return email !== null && (email === LEGACY_DEMO_EMAIL || email.startsWith('demo-'))
}

function clearDemoState() {
  localStorage.removeItem('demoPersona')
}

function identifyUser(userData: User) {
  analytics.identify(userData.id, {
    email: userData.email,
    name: userData.name,
    role: userData.role,
    is_demo: isDemoEmail(userData.email),
    is_guest: isGuestSession(userData),
  })
  if (!isDemoEmail(userData.email)) {
    void syncNativePushToken().catch((error) => {
      console.error('[push] could not attach native device to signed-in user:', error)
    })
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasDemoReturnSession, setHasDemoReturnSession] = useState(
    () => Boolean(sessionStorage.getItem(DEMO_RETURN_TOKEN_KEY)),
  )
  const queryClient = useQueryClient()

  /**
   * Take on an identity, and point the day at wherever that identity's day lives.
   *
   * A Guest's day is on the device, so the services have to know before any query
   * runs — which is why this sits beside `setUser` rather than in an effect that
   * could land after the first fetch.
   */
  const adoptUser = (userData: User | null) => {
    setLocalDayUser(holdsLocalDay(userData) ? userData!.id : null)
    setCurrentUser(userData)
  }

  useEffect(() => {
    const token = readSessionToken()
    const returnToken = sessionStorage.getItem(DEMO_RETURN_TOKEN_KEY)
    const tokenToVerify = token ?? returnToken
    if (tokenToVerify) {
      // Verify token and get user info
      authService.verifyToken(token ? undefined : tokenToVerify)
        .then(({ user: userData, renewedToken }) => {
          if (!token && returnToken) {
            // A re-issued session supersedes the one we verified with, so store
            // the fresher of the two.
            writeSessionToken(renewedToken ?? returnToken)
            sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
            setHasDemoReturnSession(false)
          }
          if (!isDemoEmail(userData.email)) {
            clearDemoState()
            sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
            setHasDemoReturnSession(false)
          }
          identifyUser(userData)
          adoptUser(userData)
        })
        .catch(() => {
          clearSessionToken()
          void clearTodayWidget().catch((error) => {
            console.error('[widget] could not clear signed-out Today widget:', error)
          })
          if (!token && returnToken) {
            sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
            setHasDemoReturnSession(false)
          }
          // A day still sitting on this device with no session that can reach it
          // is a stranded Guest, not a first-time visitor. Bouncing them to a
          // sign-in screen they cannot pass, with no explanation, is the silent
          // failure ADR-0010 forbids.
          void localDayExists().then((stranded) => {
            if (!stranded) return
            sessionStorage.setItem(
              'healthyflow-auth-notice',
              'This iPhone still holds your day, but the session that opened it is gone. Sign in or create an account to keep going.',
            )
          }).catch(() => undefined)
          queryClient.clear()
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      void clearTodayWidget().catch((error) => {
        console.error('[widget] could not clear signed-out Today widget:', error)
      })
      setLoading(false)
    }
  }, [queryClient])

  const login = async (email: string, password: string) => {
    try {
      const { user: userData, token } = await authService.login(email, password)
      queryClient.clear()
      if (!isDemoEmail(userData.email)) clearDemoState()
      sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
      setHasDemoReturnSession(false)
      clearDemoAcquisition()
      writeSessionToken(token)
      identifyUser(userData)
      analytics.capture('logged_in', { is_demo: isDemoEmail(userData.email) })
      adoptUser(userData)
      toast.success('Welcome back!')
    } catch (error) {
      toast.error('Invalid credentials')
      throw error
    }
  }

  const loginWithProvider = async (
    provider: AuthProvider,
    accessToken: string,
    invite?: string,
    displayName?: string,
  ) => {
    const acquisition = readDemoAcquisition()
    const result = await authService.providerSession(provider, accessToken, invite, displayName)
    const { user: userData, token, isNewUser, signupCredits } = result
    queryClient.clear()
    clearDemoState()
    sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
    setHasDemoReturnSession(false)
    writeSessionToken(token)
    identifyUser(userData)
    if (isNewUser && signupCredits) {
      analytics.identify(userData.id, {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        is_demo: false,
        onboarding_status: 'active',
        signup_credit_cohort: signupCredits.cohort,
        onboarding_credit_grant: signupCredits.credits,
      }, { signed_up_at: new Date().toISOString() })
      analytics.capture('signed_up', {
        method: provider,
        credit_cohort: signupCredits.cohort,
        onboarding_credits: signupCredits.credits,
        source: acquisition ? 'demo' : 'direct',
        persona: acquisition?.persona,
      })
      toast.success(`Account created with ${signupCredits.credits} AI credits. Welcome to HealthyFlow.`)
    } else {
      clearDemoAcquisition()
      analytics.capture('logged_in', { method: provider, is_demo: false })
      toast.success('Welcome back!')
    }
    adoptUser(userData)
  }

  const signup = async (email: string, password: string, name: string, invite?: string) => {
    try {
      const acquisition = readDemoAcquisition()
      const { user: userData, token, signupCredits } = await authService.signup(email, password, name, invite)
      queryClient.clear()
      clearDemoState()
      sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
      setHasDemoReturnSession(false)
      writeSessionToken(token)
      analytics.identify(userData.id, {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        is_demo: isDemoEmail(userData.email),
        onboarding_status: 'active',
        signup_credit_cohort: signupCredits.cohort,
        onboarding_credit_grant: signupCredits.credits,
      }, { signed_up_at: new Date().toISOString() })
      analytics.capture('signed_up', {
        method: 'password',
        credit_cohort: signupCredits.cohort,
        onboarding_credits: signupCredits.credits,
        source: acquisition ? 'demo' : 'direct',
        persona: acquisition?.persona,
      })
      adoptUser(userData)
      toast.success(`Account created with ${signupCredits.credits} AI credits. Welcome to HealthyFlow.`)
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Signup failed'
      toast.error(msg)
      throw error
    }
  }

  /**
   * Start without an account.
   *
   * The row created here holds identity and a credit balance; the day itself is
   * written to this device and nowhere else. There is no email and no password, so
   * this session is the only key back to it (ADR-0010) — which is what the entry
   * point has to say before anyone taps it.
   */
  const startGuestSession = async () => {
    try {
      const { user: userData, token } = await authService.startGuestSession()
      queryClient.clear()
      clearDemoState()
      sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
      setHasDemoReturnSession(false)
      resetLocalStore()
      writeSessionToken(token)
      rememberLocalDayOwner(userData.id)
      identifyUser(userData)
      analytics.capture('guest_started')
      adoptUser(userData)
    } catch (error) {
      // Rethrown unhandled: the entry point owns the message, because only it can
      // say what actually failed. A toast here would be a second, vaguer copy of
      // the same failure.
      throw error
    }
  }

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

  /**
   * Sign in to an account that already exists, from a Guest session.
   *
   * Two identities meet here, and so do two days. This runs in two halves on
   * purpose: `previewSignIn` authenticates and reads the account's day *without
   * writing anything*, so the person can be shown real numbers before choosing;
   * `completeSignIn` is the only step that touches their device.
   *
   * Splitting it is what makes the choice honest. A single call would have to
   * decide before asking.
   */
  const previewSignIn = async (
    method: 'password' | AuthProvider,
    credentials: { email?: string; password?: string; accessToken?: string },
  ) => {
    const session = method === 'password'
      ? await authService.login(credentials.email!, credentials.password!)
      : await authService.providerSession(method, credentials.accessToken!)

    // Read with the new token explicitly rather than storing it first: nothing is
    // committed until the person has chosen.
    const archive = await accountService.exportArchive(session.token)
    const accountDay = localDayFromExport(session.user.id, archive)
    const deviceDay = user ? await loadLocalDatabase(user.id) : null

    return {
      session,
      accountDay,
      onDevice: deviceDay ? countLocalDay(deviceDay) : null,
      fromAccount: countLocalDay(accountDay),
      deviceDay,
    }
  }

  const completeSignIn = async (
    preview: Awaited<ReturnType<typeof previewSignIn>>,
    choice: AdoptionChoice,
  ) => {
    const { session, accountDay, deviceDay } = preview
    const adopted = deviceDay ? adoptAccountDay(deviceDay, accountDay, choice) : accountDay

    // The day lands first. If this throws, the session is untouched and the Guest
    // is still themselves, with their day where it was.
    await replaceLocalDay(adopted)

    queryClient.clear()
    clearDemoState()
    sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
    setHasDemoReturnSession(false)
    writeSessionToken(session.token)
    rememberLocalDayOwner(session.user.id)
    identifyUser(session.user)
    analytics.capture('logged_in', { is_demo: false, method: method_(session.user.authMethod) })
    adoptUser(session.user)
    toast.success('Signed in. Your day is on this iPhone.')
  }

  const startDemoSession = async (persona: DemoPersonaId) => {
    try {
      const acquisition = readDemoAcquisition()
      const returnToken = user && !isDemoEmail(user.email)
        ? readSessionToken()
        : null
      const { user: userData, token } = await authService.startDemoSession(persona)
      queryClient.clear()
      if (returnToken && !sessionStorage.getItem(DEMO_RETURN_TOKEN_KEY)) {
        sessionStorage.setItem(DEMO_RETURN_TOKEN_KEY, returnToken)
        setHasDemoReturnSession(true)
      }
      writeSessionToken(token)
      localStorage.setItem('demoPersona', persona)
      identifyUser(userData)
      analytics.capture('demo_started', {
        persona,
        entry_source: acquisition?.entrySource,
      })
      adoptUser(userData)
      toast.success('Demo loaded')
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Could not start demo'
      toast.error(msg)
      throw error
    }
  }

  const leaveDemoSession = async () => {
    const returnToken = sessionStorage.getItem(DEMO_RETURN_TOKEN_KEY)

    if (!returnToken) {
      clearSessionToken()
      clearDemoState()
      queryClient.clear()
      analytics.reset()
      adoptUser(null)
      return false
    }

    sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
    setHasDemoReturnSession(false)
    try {
      const { user: userData, renewedToken } = await authService.verifyToken(returnToken)
      writeSessionToken(renewedToken ?? returnToken)
      clearDemoState()
      identifyUser(userData)
      adoptUser(userData)
      queryClient.clear()
      return true
    } catch {
      clearSessionToken()
      clearDemoState()
      queryClient.clear()
      analytics.reset()
      adoptUser(null)
      return false
    }
  }

  const logout = () => {
    const authToken = readSessionToken()
    void detachNativePushToken(authToken).catch((error) => {
      console.error('[push] could not detach native device during logout:', error)
    })
    void clearTodayWidget().catch((error) => {
      console.error('[widget] could not clear Today widget during logout:', error)
    })
    clearSessionToken()
    clearDemoState()
    sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
    setHasDemoReturnSession(false)
    clearDemoAcquisition()
    resetLocalStore()
    queryClient.clear()
    analytics.reset()
    adoptUser(null)
    toast.success('Logged out successfully')
  }

  const completeAccountDeletion = () => {
    void clearTodayWidget().catch((error) => {
      console.error('[widget] could not clear Today widget after account deletion:', error)
    })
    // Deleting the account has to take the day with it. For a Guest this file is
    // the only copy there has ever been, so leaving it behind would both lie about
    // the deletion and block the next session on this device.
    void clearLocalDay().catch((error) => {
      console.error('[local] could not erase the day on this device:', error)
    })
    forgetLocalDayOwner()
    clearSessionToken()
    clearDemoState()
    sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
    setHasDemoReturnSession(false)
    clearDemoAcquisition()
    localStorage.removeItem('healthyflow-assistant-conversations-v1')
    localStorage.removeItem('healthyflow-assistant-conversations-v1-migrated')
    queryClient.clear()
    analytics.reset()
    adoptUser(null)
    toast.success('Account deleted')
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      loginWithProvider,
      startGuestSession,
      claimAccount,
      previewSignIn,
      completeSignIn,
      startDemoSession,
      leaveDemoSession,
      signup,
      logout,
      completeAccountDeletion,
      isDemoSession: Boolean(user && isDemoEmail(user.email)),
      isGuest: isGuestSession(user),
      hasDemoReturnSession,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
