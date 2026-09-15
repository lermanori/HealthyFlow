import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, MailWarning } from 'lucide-react'
import LoadingSpinner from '../components/LoadingSpinner'
import { authService, challengeRefusal, type ChallengeRefusal } from '../services/api'

/**
 * What a refused link means, in the words the person needs.
 *
 * The server answers with four reasons rather than "invalid link" because each
 * one sends someone somewhere different — and someone locked out of their own
 * account is the last person who should have to guess which happened.
 */
const REFUSAL_COPY: Record<ChallengeRefusal, string> = {
  expired: 'This reset link has expired — they last an hour. Ask for a new one below.',
  already_used: 'This reset link has already been used. If that was not you, ask for a new one.',
  superseded: 'A newer reset link was sent after this one. Open the most recent email instead.',
  unknown: 'This link is not one we recognise. Check you opened the most recent email.',
}

function requestMessage(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response
  if (!response) return 'Could not reach HealthyFlow. Check your connection and try again.'
  const message = response.data?.error
  if (typeof message === 'string' && message) return message
  return `Could not send a reset link (server said ${response.status ?? 'nothing'}).`
}

/** Asking for a link. Shown when there is no token in the address. */
function RequestForm() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      const { message } = await authService.requestPasswordReset(email)
      // The server's own wording, which is deliberately the same whether or not
      // that address has an account. Rewording it here would be the one place
      // the difference leaks.
      setSent(message)
    } catch (requestError) {
      setError(requestMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto w-full max-w-md space-y-5 py-10 text-center">
        <KeyRound className="mx-auto h-10 w-10 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Check your email</h1>
        <p className="text-sm text-ink-muted">{sent}</p>
        <p className="text-xs text-ink-muted">The link works once and expires in an hour.</p>
        <button type="button" className="btn-secondary w-full" onClick={() => navigate('/')}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Reset your password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Enter the email address on your account and we will send you a link.
        </p>
      </header>

      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => { event.preventDefault(); void submit() }}
      >
        <div>
          <label htmlFor="reset-email" className="mb-2 block text-sm font-medium text-ink-soft">Email address</label>
          <input
            id="reset-email"
            type="email"
            className="input-field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {error && (
          <p role="alert" className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">{error}</p>
        )}

        <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2" disabled={busy}>
          {busy ? <LoadingSpinner size="sm" /> : null}
          Send me a link
        </button>
        <button type="button" className="btn-secondary w-full" onClick={() => navigate('/')}>
          Back
        </button>
      </form>
    </div>
  )
}

/** Spending a link. Shown when the address carries a token. */
function NewPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [refused, setRefused] = useState<ChallengeRefusal | null>(null)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    setRefused(null)
    setBusy(true)
    try {
      await authService.resetPassword(token, password)
      setDone(true)
    } catch (resetError) {
      const reason = challengeRefusal(resetError)
      if (reason) setRefused(reason)
      else setError(requestMessage(resetError))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md space-y-5 py-10 text-center">
        <KeyRound className="mx-auto h-10 w-10 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Password changed</h1>
        <p className="text-sm text-ink-muted">Sign in with your new password.</p>
        <button type="button" className="btn-primary w-full" onClick={() => navigate('/sign-in')}>
          Sign in
        </button>
      </div>
    )
  }

  if (refused) {
    return (
      <div className="mx-auto w-full max-w-md space-y-5 py-10 text-center">
        <MailWarning className="mx-auto h-10 w-10 text-ink-muted" />
        <h1 className="text-2xl font-bold text-ink">This link did not work</h1>
        <p className="text-sm text-ink-muted">{REFUSAL_COPY[refused]}</p>
        {/* Dropping the token puts this same page back into its request form. */}
        <button type="button" className="btn-primary w-full" onClick={() => navigate('/reset-password')}>
          Send me a new link
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Choose a new password</h1>
      </header>

      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => { event.preventDefault(); void submit() }}
      >
        <div>
          <label htmlFor="reset-password" className="mb-2 block text-sm font-medium text-ink-soft">New password</label>
          <input
            id="reset-password"
            type="password"
            minLength={8}
            className="input-field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />
          <p className="mt-1 text-xs text-ink-muted">At least 8 characters.</p>
        </div>

        {error && (
          <p role="alert" className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">{error}</p>
        )}

        <button type="submit" className="btn-primary flex w-full items-center justify-center gap-2" disabled={busy}>
          {busy ? <LoadingSpinner size="sm" /> : null}
          Set new password
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  return token ? <NewPasswordForm token={token} /> : <RequestForm />
}
