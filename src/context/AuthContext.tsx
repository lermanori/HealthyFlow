import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authService } from '../services/api'
import { analytics } from '../lib/analytics'
import type { DemoPersonaId } from '../demoPersonas'
import toast from 'react-hot-toast'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  startDemoSession: (persona: DemoPersonaId) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const LEGACY_DEMO_EMAIL = 'demo@healthyflow.com'

function isDemoEmail(email: string) {
  return email === LEGACY_DEMO_EMAIL || email.startsWith('demo-')
}

function clearDemoState() {
  localStorage.removeItem('demoPersona')
  localStorage.removeItem('mayaDemoGuide')
}

function identifyUser(userData: User) {
  analytics.identify(userData.id, {
    email: userData.email,
    name: userData.name,
    role: userData.role,
    is_demo: isDemoEmail(userData.email),
  })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      // Verify token and get user info
      authService.verifyToken()
        .then(userData => {
          if (!isDemoEmail(userData.email)) clearDemoState()
          identifyUser(userData)
          setUser(userData)
        })
        .catch(() => {
          localStorage.removeItem('token')
          queryClient.clear()
        })
        .finally(() => {
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [queryClient])

  const login = async (email: string, password: string) => {
    try {
      const { user: userData, token } = await authService.login(email, password)
      queryClient.clear()
      if (!isDemoEmail(userData.email)) clearDemoState()
      localStorage.setItem('token', token)
      identifyUser(userData)
      analytics.capture('logged_in', { is_demo: isDemoEmail(userData.email) })
      setUser(userData)
      toast.success('Welcome back!')
    } catch (error) {
      toast.error('Invalid credentials')
      throw error
    }
  }

  const signup = async (email: string, password: string, name: string) => {
    try {
      const { user: userData, token } = await authService.signup(email, password, name)
      queryClient.clear()
      clearDemoState()
      localStorage.setItem('token', token)
      analytics.identify(userData.id, {
        email: userData.email,
        name: userData.name,
        role: userData.role,
        is_demo: isDemoEmail(userData.email),
        onboarding_status: 'active',
      }, { signed_up_at: new Date().toISOString() })
      analytics.capture('signed_up', { method: 'password' })
      setUser(userData)
      toast.success('Account created! Welcome to HealthyFlow.')
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Signup failed'
      toast.error(msg)
      throw error
    }
  }

  const startDemoSession = async (persona: DemoPersonaId) => {
    try {
      const { user: userData, token } = await authService.startDemoSession(persona)
      queryClient.clear()
      localStorage.setItem('token', token)
      localStorage.setItem('demoPersona', persona)
      localStorage.setItem('mayaDemoGuide', 'open')
      identifyUser(userData)
      analytics.capture('demo_started', { persona })
      setUser(userData)
      toast.success('Demo loaded')
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Could not start demo'
      toast.error(msg)
      throw error
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    clearDemoState()
    queryClient.clear()
    analytics.reset()
    setUser(null)
    toast.success('Logged out successfully')
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, startDemoSession, signup, logout }}>
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
