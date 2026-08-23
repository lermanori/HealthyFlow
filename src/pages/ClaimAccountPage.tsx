import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Apple, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { beginNativeGoogleSignIn } from '../services/googleAuth'
import { beginAppleSignIn } from '../services/appleAuth'
import { isNativeIOS } from '../lib/native'
import { LocalStoreError } from '../lib/local/store'

/** Why a claim failed, according to what came back. Never a guess. */
function claimMessage(error: unknown) {
  // A failure with no HTTP response is not automatically the network: reading or
  // writing this device's own day can fail too, and saying "check your
  // connection" about that sends someone to fix the wrong thing.
  if (error instanceof LocalStoreError) return error.message
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response
  if (!response) return 'Could not reach HealthyFlow. Check your connection and try again.'
  const message = response.data?.error
  if (typeof message === 'string' && message) return message
  return `Could not create your account (server said ${response.status ?? 'nothing'}).`
}

export default function ClaimAccountPage() {
  const { claimAccount } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<null | 'password' | 'google' | 'apple'>(null)

  const run = async (method: 'password' | 'google' | 'apple') => {
    setError('')
    setBusy(method)
    try {
      if (method === 'password') {
        await claimAccount('password', { email, password, name })
      } else if (method === 'google') {
        const { accessToken } = await beginNativeGoogleSignIn()
        await claimAccount('google', { accessToken })
      } else {
        // Apple returns a name only on the very first authorization, so it has
        // to be carried through here or the account is named after its email.
        const { accessToken, displayName } = await beginAppleSignIn()
        await claimAccount('apple', { accessToken, name: displayName })
      }
      navigate('/')
    } catch (claimError) {
      setError(claimMessage(claimError))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-5 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Create an account</h1>
        {/*
          The one thing worth saying, and it is true rather than reassuring: the
          day does not move, so nothing about it can go wrong here.
        */}
        <p className="mt-2 text-sm text-ink-muted">
          Your day stays exactly where it is, on this iPhone. An email is what
          makes it recoverable, and what lets you buy AI credits.
        </p>
      </header>

      <div className={isNativeIOS ? 'grid grid-cols-2 gap-3' : ''}>
        <button
          type="button"
          onClick={() => void run('google')}
          disabled={busy !== null}
          className="btn-secondary flex w-full items-center justify-center gap-2 px-3 py-3.5"
        >
          {busy === 'google' ? <LoadingSpinner size="sm" /> : null}
          <span className={isNativeIOS ? 'text-xs' : ''}>Continue with Google</span>
        </button>
        {isNativeIOS && (
          <button
            type="button"
            onClick={() => void run('apple')}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-control border border-ink bg-ink px-3 py-3.5 text-xs font-semibold text-page transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === 'apple' ? <LoadingSpinner size="sm" /> : <Apple className="h-5 w-5" />}
            <span>Continue with Apple</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => { event.preventDefault(); void run('password') }}
      >
        <div>
          <label htmlFor="claim-name" className="mb-2 block text-sm font-medium text-ink-soft">Your name</label>
          <input
            id="claim-name"
            className="input-field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label htmlFor="claim-email" className="mb-2 block text-sm font-medium text-ink-soft">Email address</label>
          <input
            id="claim-email"
            type="email"
            className="input-field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div>
          <label htmlFor="claim-password" className="mb-2 block text-sm font-medium text-ink-soft">Password</label>
          <input
            id="claim-password"
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
          <p role="alert" className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy !== null}
          className="btn-primary flex w-full items-center justify-center gap-2 px-3 py-3.5"
        >
          {busy === 'password' ? <LoadingSpinner size="sm" /> : <ArrowRight className="h-5 w-5" />}
          <span>Create account</span>
        </button>
      </form>
    </div>
  )
}
