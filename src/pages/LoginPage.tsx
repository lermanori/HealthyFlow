import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Brain, Mail, Lock, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { waitlistService, type SignupStatus } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import { analytics } from '../lib/analytics'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState(mode === 'login' ? 'demo@healthyflow.com' : '')
  const [password, setPassword] = useState(mode === 'login' ? 'demo123' : '')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [signupStatus, setSignupStatus] = useState<SignupStatus | null>(null)
  const [inviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite') ?? undefined)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistJoined, setWaitlistJoined] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false)
  const { login, signup } = useAuth()

  // An invite always opens the form; otherwise the public slot count decides.
  const signupAllowed = Boolean(inviteToken) || signupStatus?.mode === 'open'

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = window.navigator.standalone === true
    setIsStandalone(standalone || iosStandalone)
  }, [])

  useEffect(() => {
    // Fail closed: if the status call fails we leave signupStatus null, which hides
    // the Create account tab. Showing a signup form we cannot honour would send the
    // user through a form that 403s. Login is unaffected either way.
    waitlistService.signupStatus().then(setSignupStatus).catch(() => setSignupStatus(null))
  }, [])

  // If the status arrives closed while the signup tab is selected, fall back to
  // login rather than showing a form that cannot succeed.
  useEffect(() => {
    if (signupStatus && !signupAllowed && mode === 'signup') setMode('login')
  }, [signupStatus, signupAllowed, mode])

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setWaitlistError('')
    setWaitlistSubmitting(true)
    try {
      await waitlistService.join({ email: waitlistEmail, source: 'login-page' })
      analytics.capture('waitlist_submitted', { source: 'login' })
      setWaitlistJoined(true)
    } catch (_err) {
      setWaitlistError('Something went wrong — please try again.')
    } finally {
      setWaitlistSubmitting(false)
    }
  }

  // Reset form when switching modes
  const switchMode = (next: 'login' | 'signup') => {
    setMode(next)
    setError('')
    setEmail(next === 'login' ? 'demo@healthyflow.com' : '')
    setPassword(next === 'login' ? 'demo123' : '')
    setName('')
    setConfirmPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (mode === 'signup') {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await signup(email, password, name, inviteToken)
      }
    } catch (err: any) {
      // Surface inline error for "email already taken" and similar
      const msg = err?.response?.data?.error
      if (msg) setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-page p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="card">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-section bg-action">
                <Brain className="w-10 h-10 text-white" />
            </div>

            <div>
              <h1 className="mb-2 text-2xl font-bold text-ink md:text-3xl">
                Welcome to HealthyFlow
              </h1>
              <p className="font-medium text-ink-soft">Plan your day. Track what matters.</p>
              <p className="mt-1 text-sm text-ink-muted">Tasks, habits, health, and workouts in one place.</p>
            </div>

            {/* Mode toggle — the signup tab only exists when signup can succeed */}
            <div className="flex mt-4 rounded-xl overflow-hidden border border-line">
              <button
                type="button"
                onClick={() => switchMode('login')}
                aria-pressed={mode === 'login'}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-action text-on-action' : 'bg-card text-ink-muted hover:bg-raised hover:text-ink'}`}
              >
                Sign in
              </button>
              {signupAllowed && (
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  aria-pressed={mode === 'signup'}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-action text-on-action' : 'bg-card text-ink-muted hover:bg-raised hover:text-ink'}`}
                >
                  Create account
                </button>
              )}
            </div>

            {inviteToken && (
              <div className="mt-3 space-y-1 text-sm text-accent">
                <p>You've been invited — create your account below.</p>
                {signupStatus?.offer && (
                  <p>{signupStatus.offer.onboardingCredits} AI credits are included for onboarding.</p>
                )}
              </div>
            )}

            {!inviteToken && signupStatus?.mode === 'open' && (
              <div className="mt-3 space-y-1 text-sm text-accent">
                <p>{signupStatus.remaining} {signupStatus.remaining === 1 ? 'spot' : 'spots'} left</p>
                <p>{signupStatus.offer.onboardingCredits} AI credits are included for onboarding.</p>
              </div>
            )}

            {!inviteToken && signupStatus?.mode === 'waitlist' && (
              <div className="mt-4 rounded-xl border border-line p-4 text-left">
                {waitlistJoined ? (
                  <p className="text-sm text-state-success">
                    You're on the list. We'll email you when a spot opens.
                  </p>
                ) : (
                  <form onSubmit={handleWaitlistSubmit}>
                    <label htmlFor="waitlist-email" className="block text-sm font-medium text-ink-soft mb-2">
                      Registration is invite-only — join the waitlist
                    </label>
                    <p className="mb-3 text-xs text-ink-muted">
                      The first {signupStatus.offer.foundingMemberLimit} accounts receive{' '}
                      {signupStatus.offer.foundingOnboardingCredits} AI credits for onboarding.
                    </p>
                    <input
                      id="waitlist-email"
                      type="email"
                      required
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      className="input-field"
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                    {waitlistError && <p className="mt-2 text-sm text-state-danger">{waitlistError}</p>}
                    <button type="submit" disabled={waitlistSubmitting} className="btn-primary mt-3 w-full">
                      {waitlistSubmitting ? 'Joining…' : 'Join the waitlist'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-ink-soft mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-field pl-12"
                    placeholder="Your name"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-soft mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-12"
                  placeholder="Enter your email"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-soft mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-12"
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-soft mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-ink-muted" />
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field pl-12"
                    placeholder="Repeat password"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            {/* Inline error */}
            {error && (
              <p role="alert" className="text-center text-sm text-state-danger">{error}</p>
            )}

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center space-x-2 py-4 mt-2"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>{mode === 'login' ? 'Logging in...' : 'Creating account...'}</span>
                </>
              ) : (
                <>
                  <Brain className="w-5 h-5" />
                  <span>{mode === 'login' ? 'Login' : 'Create Account'}</span>
                </>
              )}
            </motion.button>
          </form>

          {mode === 'login' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="mt-6 rounded-section border border-line bg-raised/55 p-4"
            >
              <div className="text-center">
                <p className="text-sm text-ink-soft font-medium mb-2">
                  Demo access
                </p>
                <div className="space-y-1 text-xs text-ink-muted">
                  <p><strong className="text-ink-soft">Email:</strong> demo@healthyflow.com</p>
                  <p><strong className="text-ink-soft">Password:</strong> demo123</p>
                </div>
                <Link
                  to="/demo"
                  className="mt-4 inline-flex items-center justify-center rounded-control border border-accent/35 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:border-accent hover:bg-accent/15"
                >
                  Watch the guided demo
                </Link>
              </div>
            </motion.div>
          )}

          {/* PWA Status Indicator */}
          {isStandalone && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-4 rounded-section border border-line bg-raised/55 p-3"
            >
              <div className="flex items-center justify-center space-x-2">
                <p className="text-xs text-ink-muted">Running as installed app</p>
              </div>
            </motion.div>
          )}

          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-ink-muted">
            <a href="/" className="transition-colors hover:text-accent">
              What is HealthyFlow?
            </a>
            <span aria-hidden="true">|</span>
            <Link to="/privacy" className="transition-colors hover:text-accent">
              Privacy Policy
            </Link>
            <span aria-hidden="true">|</span>
            <Link to="/terms" className="transition-colors hover:text-accent">
              Terms of Service
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
