import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, MailWarning } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { authService, challengeRefusal, type ChallengeRefusal } from '../services/api'
import { useAuth } from '../context/AuthContext'

/**
 * What a refused link means, in the words the person needs.
 *
 * Each of these sends someone somewhere different, which is the whole reason the
 * server answers with four reasons instead of "invalid link".
 */
const REFUSAL_COPY: Record<ChallengeRefusal, string> = {
  expired: 'This link has expired. Ask for a new one and it will arrive in a moment.',
  already_used: 'This link has already been used — which usually means it worked. Try signing in.',
  superseded: 'A newer link was sent after this one. Open the most recent email instead.',
  unknown: 'This link is not one we recognise. Check you opened the most recent email.',
}

type State =
  | { step: 'confirming' }
  | { step: 'verified' }
  | { step: 'refused'; reason: ChallengeRefusal }
  | { step: 'failed'; message: string }
  | { step: 'no_token' }

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refreshSession } = useAuth()
  const token = params.get('token')
  const [state, setState] = useState<State>(token ? { step: 'confirming' } : { step: 'no_token' })

  // A verification link is single-use. React 18 mounts effects twice in
  // development, and without this the second run spends the token the first one
  // just consumed and the screen reports "already used" for a link that worked.
  const spent = useRef(false)

  useEffect(() => {
    if (!token || spent.current) return
    spent.current = true

    void (async () => {
      try {
        await authService.confirmEmail(token)
        setState({ step: 'verified' })
        // The session says `emailVerified` and it just changed. Re-reading it
        // here is what stops the banner surviving its own reason for existing.
        await refreshSession()
      } catch (error) {
        const reason = challengeRefusal(error)
        if (reason) {
          setState({ step: 'refused', reason })
          return
        }
        setState({
          step: 'failed',
          message: 'Could not reach HealthyFlow. Check your connection and try again.',
        })
      }
    })()
  }, [token, refreshSession])

  return (
    // Same shell as LoginPage. These pages render outside the authenticated
    // app shell, so nothing else gives them the notch and home-indicator
    // insets — `native-auth-page` is where those live, and `env(safe-area-*)`
    // is 0 on the web, so it is applied unconditionally rather than gated.
    <div className="native-auth-page flex min-h-screen items-start justify-center bg-page px-4 py-6 sm:items-center sm:py-10">
      <div className="w-full max-w-md space-y-5 text-center">
      {state.step === 'confirming' && (
        <>
          <LoadingSpinner size="lg" />
          <p className="text-sm text-ink-muted">Confirming your email address…</p>
        </>
      )}

      {state.step === 'verified' && (
        <>
          <CheckCircle2 className="mx-auto h-10 w-10 text-ink" />
          <h1 className="text-2xl font-bold text-ink">Email confirmed</h1>
          <p className="text-sm text-ink-muted">
            If you ever forget your password, you can now reset it yourself.
          </p>
          <button type="button" className="btn-primary w-full" onClick={() => navigate('/')}>
            Back to my day
          </button>
        </>
      )}

      {(state.step === 'refused' || state.step === 'failed' || state.step === 'no_token') && (
        <>
          <MailWarning className="mx-auto h-10 w-10 text-ink-muted" />
          <h1 className="text-2xl font-bold text-ink">This link did not work</h1>
          <p className="text-sm text-ink-muted">
            {state.step === 'refused' ? REFUSAL_COPY[state.reason] : null}
            {state.step === 'failed' ? state.message : null}
            {state.step === 'no_token' ? 'This address is missing its verification token. Open the link from your email directly.' : null}
          </p>
          <button type="button" className="btn-secondary w-full" onClick={() => navigate('/')}>
            Back to my day
          </button>
        </>
      )}
      </div>
    </div>
  )
}
