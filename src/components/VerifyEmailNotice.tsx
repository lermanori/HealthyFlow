import { useState } from 'react'
import { MailCheck } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { authService } from '../services/api'
import { useAuth } from '../context/AuthContext'

/**
 * A prompt to confirm the address on file, and the only way to ask for a link.
 *
 * Shown only where it is actionable: an account with a password and an
 * unconfirmed address. A Guest has no address, and Google and Apple accounts
 * arrive already proven by their provider.
 *
 * Deliberately not a blocker. An unconfirmed address costs nothing today — it
 * costs a way back in on the day the password is forgotten, which is what this
 * says rather than inventing a penalty to sound urgent.
 */
export default function VerifyEmailNotice() {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')

  const eligible = user
    && user.email
    && user.authMethod === 'password'
    && !user.emailVerified
  if (!eligible) return null

  const send = async () => {
    setError('')
    setState('sending')
    try {
      const result = await authService.sendVerificationEmail()
      setState(result.state === 'sent' ? 'sent' : 'idle')
    } catch (sendError) {
      // A failed send is not a sent mail. Saying "check your inbox" here would
      // leave someone watching for a link that does not exist.
      const response = (sendError as { response?: { data?: { error?: unknown } } })?.response
      const message = response?.data?.error
      setError(typeof message === 'string' && message
        ? message
        : 'Could not send a verification email. Try again in a moment.')
      setState('idle')
    }
  }

  return (
    <div className="rounded-control border border-line-strong bg-raised/50 p-3">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          {state === 'sent' ? (
            <p className="text-sm text-ink-soft">
              Sent. Open the link in that email to confirm <strong className="font-medium text-ink">{user.email}</strong>.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                This address is not confirmed yet. Confirm it and you can reset your own
                password if you ever forget it.
              </p>
              {error && (
                <p role="alert" className="mt-2 rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">{error}</p>
              )}
              <button
                type="button"
                onClick={() => void send()}
                disabled={state === 'sending'}
                className="btn-secondary mt-2 flex items-center justify-center gap-2 px-3 py-2 text-sm"
              >
                {state === 'sending' ? <LoadingSpinner size="sm" /> : null}
                Send me a link
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
