import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Lock, Mail, Play, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { waitlistService, type SignupStatus } from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import AppMark from '../components/AppMark'
import { analytics } from '../lib/analytics'
import {
  beginGoogleOAuth,
  clearGoogleOAuth,
  completeGoogleOAuthCallback,
  getCurrentGoogleAccessToken,
  getPendingGoogleInvite,
  getPendingGoogleReturnTo,
  GoogleOAuthCallbackError,
  isGoogleOAuthCallback,
  replaceOAuthCallbackUrl,
} from '../services/googleAuth'
import {
  beginDemoAcquisition,
  demoPersonaById,
  parseDemoPersonaId,
  readDemoAcquisition,
} from '../demoPersonas'

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.64-2.43l-3.24-2.54c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.86A6.01 6.01 0 0 1 6.08 12c0-.65.11-1.28.31-1.86V7.52H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.48l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 6.01c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.66 9.66 0 0 0 12 2a10 10 0 0 0-8.96 5.52l3.35 2.62C7.18 7.77 9.39 6.01 12 6.01Z" />
    </svg>
  )
}

function googleExchangeMessage(error: unknown) {
  if (error instanceof GoogleOAuthCallbackError) return error.message
  const response = (error as {
    response?: { status?: number; data?: { error?: unknown; reason?: unknown } }
  })?.response
  const reason = response?.data?.reason
  if (reason === 'invite_expired') return 'This invitation has expired. Ask for a new invitation.'
  if (reason === 'invite_used') return 'This invitation has already been used.'
  if (reason === 'invite_invalid') return 'This invitation is invalid. Check the link or ask for a new invitation.'
  if (reason === 'closed') return 'New accounts are invite-only right now. Join the waitlist or use a valid invitation.'
  if (reason === 'identity_conflict') return 'This Google account is already linked to another HealthyFlow account.'
  if (reason === 'provider_session_invalid' || response?.status === 401) {
    return 'Google sign-in expired. Please try again.'
  }
  if (reason === 'provider_unavailable' || response?.status === 503) {
    return 'Google sign-in is temporarily unavailable. Please try again.'
  }
  if (!response) return 'Network error while finishing Google sign-in. Check your connection and try again.'
  const message = response.data?.error
  return typeof message === 'string' ? message : 'Could not finish Google sign-in. Please try again.'
}

function takeAuthNotice() {
  const notice = sessionStorage.getItem('healthyflow-auth-notice') ?? ''
  sessionStorage.removeItem('healthyflow-auth-notice')
  return notice
}

export default function LoginPage() {
  const [initialParams] = useState(() => new URLSearchParams(window.location.search))
  const [inviteToken] = useState(() =>
    initialParams.get('invite') ??
    getPendingGoogleInvite() ??
    undefined
  )
  const [demoAcquisition] = useState(() => {
    if (initialParams.get('from') === 'demo') {
      return beginDemoAcquisition(parseDemoPersonaId(initialParams.get('persona')), initialParams)
    }
    return isGoogleOAuthCallback() ? readDemoAcquisition() : null
  })
  const [mode, setMode] = useState<'login' | 'signup'>(() =>
    inviteToken || initialParams.get('mode') === 'signup' ? 'signup' : 'login'
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState(takeAuthNotice)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(() => isGoogleOAuthCallback())
  const [googleRetryAvailable, setGoogleRetryAvailable] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [signupStatus, setSignupStatus] = useState<SignupStatus | null>(null)
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistJoined, setWaitlistJoined] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false)
  const { login, loginWithGoogle, signup } = useAuth()
  const oauthCallbackHandled = useRef(false)

  // An invite always opens the form; otherwise the public slot count decides.
  const signupAllowed = Boolean(inviteToken) || signupStatus?.mode === 'open'

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const iosStandalone = window.navigator.standalone === true
    setIsStandalone(standalone || iosStandalone)
  }, [])

  useEffect(() => {
    if (!isGoogleOAuthCallback() || oauthCallbackHandled.current) return
    oauthCallbackHandled.current = true

    const finish = async () => {
      setError('')
      setGoogleLoading(true)
      try {
        const callback = await completeGoogleOAuthCallback()
        await loginWithGoogle(callback.accessToken, callback.invite)
        await clearGoogleOAuth()
        replaceOAuthCallbackUrl(undefined, callback.returnTo)
      } catch (callbackError) {
        const hasProviderSession = Boolean(await getCurrentGoogleAccessToken())
        const terminalResponse = (callbackError as { response?: { status?: number } })?.response
        const retryable =
          hasProviderSession &&
          (!terminalResponse || (terminalResponse.status ?? 500) >= 500)
        setGoogleRetryAvailable(retryable)
        setError(googleExchangeMessage(callbackError))
        if (!retryable) {
          const returnTo = getPendingGoogleReturnTo()
          const retainedInvite = await clearGoogleOAuth({ keepInvite: true })
          replaceOAuthCallbackUrl(retainedInvite, returnTo)
        } else {
          replaceOAuthCallbackUrl(inviteToken, getPendingGoogleReturnTo())
        }
      } finally {
        setGoogleLoading(false)
      }
    }

    void finish()
  }, [inviteToken, loginWithGoogle])

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

    const normalizedEmail = waitlistEmail.trim()
    if (!normalizedEmail) {
      setWaitlistError('Enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setWaitlistError('Enter a valid email address.')
      return
    }

    setWaitlistSubmitting(true)
    try {
      await waitlistService.join({ email: normalizedEmail, source: 'login-page' })
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
    setEmail('')
    setPassword('')
    setName('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError('Enter your email address.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.')
      return
    }
    if (!password) {
      setError('Enter your password.')
      return
    }

    if (mode === 'signup') {
      if (!name.trim()) {
        setError('Enter your name.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(normalizedEmail, password)
      } else {
        await signup(normalizedEmail, password, name.trim(), inviteToken)
      }
    } catch (err: unknown) {
      // Surface inline error for "email already taken" and similar
      const msg = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
      if (typeof msg === 'string') setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setGoogleRetryAvailable(false)
    setGoogleLoading(true)
    try {
      const returnTo = window.location.pathname === '/app/oauth/authorize'
        ? `${window.location.pathname}${window.location.search}`
        : undefined
      await beginGoogleOAuth(inviteToken, returnTo)
    } catch (oauthError) {
      setError(googleExchangeMessage(oauthError))
      setGoogleLoading(false)
    }
  }

  const retryGoogleExchange = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      const accessToken = await getCurrentGoogleAccessToken()
      if (!accessToken) {
        throw new GoogleOAuthCallbackError(
          'session_invalid',
          'Google sign-in expired. Please try again.',
        )
      }
      await loginWithGoogle(accessToken, getPendingGoogleInvite() ?? inviteToken)
      const returnTo = getPendingGoogleReturnTo()
      await clearGoogleOAuth()
      replaceOAuthCallbackUrl(undefined, returnTo)
    } catch (oauthError) {
      setError(googleExchangeMessage(oauthError))
    } finally {
      setGoogleLoading(false)
    }
  }

  const inviteSignup = Boolean(inviteToken) && mode === 'signup'
  const demoMeta = demoAcquisition ? demoPersonaById(demoAcquisition.persona) : null
  const demoSearch = new URLSearchParams({ source: 'login' })
  for (const name of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const value = initialParams.get(name)
    if (value) demoSearch.set(name, value)
  }
  const heading = inviteSignup ? "You're invited" : mode === 'signup' ? 'Create your account' : 'Welcome back'
  const supportingCopy = inviteSignup
    ? 'Create your account to start planning with HealthyFlow.'
    : mode === 'signup'
      ? demoMeta
        ? `Start your clean workspace with: “${demoMeta.activationPrompt}”`
        : 'Start with one place for your tasks, habits, health, and workouts.'
      : 'Sign in to continue planning your day.'

  return (
    <div className="relative flex min-h-screen items-start justify-center bg-page px-4 py-6 sm:items-center sm:py-10">
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="card">
          <header className="mb-6 text-center">
            <AppMark size={56} className="mx-auto mb-4 block" />
            <h1 className="text-2xl font-bold text-ink md:text-3xl">{heading}</h1>
            <p className="mt-2 text-sm text-ink-muted">{supportingCopy}</p>
          </header>

          {signupAllowed && !inviteToken && (
            <div className="mb-5 flex overflow-hidden rounded-control border border-line" aria-label="Authentication mode">
              <button
                type="button"
                onClick={() => switchMode('login')}
                aria-pressed={mode === 'login'}
                className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-action text-on-action' : 'bg-card text-ink-muted hover:bg-raised hover:text-ink'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchMode('signup')}
                aria-pressed={mode === 'signup'}
                className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${mode === 'signup' ? 'bg-action text-on-action' : 'bg-card text-ink-muted hover:bg-raised hover:text-ink'}`}
              >
                Create account
              </button>
            </div>
          )}

          {inviteSignup && signupStatus?.offer && (
            <p className="mb-5 rounded-control bg-accent/10 px-3 py-2 text-center text-sm text-accent">
              Your invitation includes {signupStatus.offer.onboardingCredits} AI credits for onboarding.
            </p>
          )}

          {!inviteToken && signupStatus?.mode === 'open' && mode === 'signup' && (
            <>
              {demoMeta && (
                <p className="mb-3 rounded-control border border-accent/25 bg-accent/[.07] px-3 py-2 text-center text-sm text-ink-soft">
                  Only your “{demoMeta.problem}” intent comes with you. The demo workspace does not.
                </p>
              )}
              <p className="mb-5 text-center text-sm text-accent">
                {signupStatus.remaining} {signupStatus.remaining === 1 ? 'spot' : 'spots'} left ·{' '}
                {signupStatus.offer.onboardingCredits} onboarding credits included
              </p>
            </>
          )}

          <button
            type="button"
            onClick={googleRetryAvailable ? retryGoogleExchange : handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="btn-secondary flex w-full items-center justify-center gap-3 py-3.5"
          >
            {googleLoading ? <LoadingSpinner size="sm" /> : <GoogleIcon />}
            <span>
              {googleLoading
                ? 'Finishing Google sign-in…'
                : googleRetryAvailable
                  ? 'Retry Google sign-in'
                  : 'Continue with Google'}
            </span>
          </button>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="name" className="mb-2 block text-sm font-medium text-ink-soft">
                  Full name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
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
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink-soft">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-12"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-ink-soft">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field px-12"
                  placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-ink-soft">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field px-12"
                    placeholder="Repeat password"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((visible) => !visible)}
                    aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-raised hover:text-ink"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">
                {error}
              </p>
            )}

            <motion.button
              type="submit"
              disabled={loading || googleLoading}
              className="btn-primary mt-2 flex w-full items-center justify-center gap-2 py-3.5"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>{mode === 'login' ? 'Signing in…' : 'Creating account…'}</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign in' : 'Create account'}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </motion.button>
          </form>

          {inviteToken && (
            <p className="mt-4 text-center text-sm text-ink-muted">
              {mode === 'signup' ? 'Already have an account?' : 'Ready to use your invitation?'}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
                className="font-semibold text-accent transition-colors hover:text-ink"
              >
                {mode === 'signup' ? 'Sign in' : 'Create account'}
              </button>
            </p>
          )}

          {mode === 'login' && (
            <div className="mt-6 border-t border-line pt-5">
              <Link to={`/demo?${demoSearch.toString()}`} className="btn-secondary flex w-full items-center justify-center gap-2">
                <Play className="h-4 w-4" aria-hidden="true" />
                See a day like yours
              </Link>
              <p className="mt-2 text-center text-xs text-ink-muted">Explore a prepared workspace. No account needed.</p>
            </div>
          )}

          {mode === 'login' && !inviteToken && signupStatus?.mode === 'waitlist' && (
            <section className="mt-5 text-center" aria-labelledby="waitlist-heading">
              {!waitlistJoined && (
                <>
                  <p id="waitlist-heading" className="text-sm text-ink-muted">
                    New to HealthyFlow?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowWaitlist((visible) => !visible)
                      setWaitlistError('')
                    }}
                    aria-expanded={showWaitlist}
                    aria-controls="waitlist-panel"
                    className="mt-1 text-sm font-semibold text-accent transition-colors hover:text-ink"
                  >
                    {showWaitlist ? 'Hide waitlist form' : 'Join the waitlist'}
                  </button>
                </>
              )}

              {(showWaitlist || waitlistJoined) && (
                <div id="waitlist-panel" className="mt-4 rounded-section border border-line bg-raised/45 p-4 text-left">
                  {waitlistJoined ? (
                    <p role="status" className="text-sm text-state-success">
                      You're on the list. We'll email you when a spot opens.
                    </p>
                  ) : (
                    <form onSubmit={handleWaitlistSubmit} noValidate>
                      <label htmlFor="waitlist-email" className="mb-2 block text-sm font-medium text-ink-soft">
                        Email address
                      </label>
                      <input
                        id="waitlist-email"
                        type="email"
                        value={waitlistEmail}
                        onChange={(e) => setWaitlistEmail(e.target.value)}
                        className="input-field"
                        placeholder="you@example.com"
                        required
                        autoComplete="email"
                      />
                      <p className="mt-2 text-xs text-ink-muted">
                        The first {signupStatus.offer.foundingMemberLimit} accounts receive{' '}
                        {signupStatus.offer.foundingOnboardingCredits} onboarding credits.
                      </p>
                      {waitlistError && (
                        <p role="alert" className="mt-2 text-sm text-state-danger">{waitlistError}</p>
                      )}
                      <button type="submit" disabled={waitlistSubmitting} className="btn-primary mt-3 w-full">
                        {waitlistSubmitting ? 'Joining…' : 'Join the waitlist'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </section>
          )}

          {isStandalone && (
            <p className="mt-4 text-center text-xs text-ink-muted">Running as installed app</p>
          )}

          <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-line pt-5 text-xs text-ink-muted">
            <a href="/" className="transition-colors hover:text-accent">What is HealthyFlow?</a>
            <Link to="/privacy" className="transition-colors hover:text-accent">Privacy</Link>
            <Link to="/terms" className="transition-colors hover:text-accent">Terms</Link>
          </footer>
        </div>
      </motion.main>
    </div>
  )
}
