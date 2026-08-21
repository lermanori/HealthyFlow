import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authService } from '../services/api'
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

// The identity a session carries. `email` is null for a Guest, and only for a
// Guest — the whole test for one is the absence of an email.
type User = SessionUser

type AuthProvider = 'google' | 'apple'

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
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasDemoReturnSession, setHasDemoReturnSession] = useState(
    () => Boolean(sessionStorage.getItem(DEMO_RETURN_TOKEN_KEY)),
  )
  const queryClient = useQueryClient()

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
          setUser(userData)
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
      setUser(userData)
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
    setUser(userData)
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
      setUser(userData)
      toast.success(`Account created with ${signupCredits.credits} AI credits. Welcome to HealthyFlow.`)
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Signup failed'
      toast.error(msg)
      throw error
    }
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
      setUser(userData)
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
      setUser(null)
      return false
    }

    sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
    setHasDemoReturnSession(false)
    try {
      const { user: userData, renewedToken } = await authService.verifyToken(returnToken)
      writeSessionToken(renewedToken ?? returnToken)
      clearDemoState()
      identifyUser(userData)
      setUser(userData)
      queryClient.clear()
      return true
    } catch {
      clearSessionToken()
      clearDemoState()
      queryClient.clear()
      analytics.reset()
      setUser(null)
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
    queryClient.clear()
    analytics.reset()
    setUser(null)
    toast.success('Logged out successfully')
  }

  const completeAccountDeletion = () => {
    void clearTodayWidget().catch((error) => {
      console.error('[widget] could not clear Today widget after account deletion:', error)
    })
    clearSessionToken()
    clearDemoState()
    sessionStorage.removeItem(DEMO_RETURN_TOKEN_KEY)
    setHasDemoReturnSession(false)
    clearDemoAcquisition()
    localStorage.removeItem('healthyflow-assistant-conversations-v1')
    localStorage.removeItem('healthyflow-assistant-conversations-v1-migrated')
    queryClient.clear()
    analytics.reset()
    setUser(null)
    toast.success('Account deleted')
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      loginWithProvider,
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
