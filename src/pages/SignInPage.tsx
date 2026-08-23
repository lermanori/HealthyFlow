import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Apple, ArrowRight } from 'lucide-react'
import { useAuth, type SignInPreview } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'
import { beginNativeGoogleSignIn } from '../services/googleAuth'
import { beginAppleSignIn } from '../services/appleAuth'
import { isNativeIOS } from '../lib/native'
import { LocalStoreError } from '../lib/local/store'
import type { AdoptionChoice } from '../lib/local/adopt'

/** Why signing in failed, according to what came back. Never a guess. */
function signInMessage(error: unknown) {
  // A failure with no HTTP response is not automatically the network: reading or
  // writing this device's own day can fail too, and saying "check your
  // connection" about that sends someone to fix the wrong thing.
  if (error instanceof LocalStoreError) return error.message
  const response = (error as { response?: { status?: number; data?: { error?: unknown } } })?.response
  if (!response) return 'Could not reach HealthyFlow. Check your connection and try again.'
  if (response.status === 401) return 'That email and password do not match an account.'
  const message = response.data?.error
  if (typeof message === 'string' && message) return message
  return `Could not sign in (server said ${response.status ?? 'nothing'}).`
}

const countLine = (counts: { items: number; habits: number; meals: number; workouts: number }) => {
  const parts = [
    counts.items === 1 ? '1 Item' : `${counts.items} Items`,
    counts.habits === 1 ? '1 Habit' : `${counts.habits} Habits`,
    counts.meals === 1 ? '1 meal' : `${counts.meals} meals`,
    counts.workouts === 1 ? '1 workout' : `${counts.workouts} workouts`,
  ]
  return parts.join(' · ')
}

export default function SignInPage() {
  const { previewSignIn, completeSignIn, isGuest } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<null | 'password' | 'google' | 'apple' | 'applying'>(null)
  const [preview, setPreview] = useState<SignInPreview | null>(null)

  const authenticate = async (method: 'password' | 'google' | 'apple') => {
    setError('')
    setBusy(method)
    try {
      const credentials = method === 'password'
        ? { email, password }
        : { accessToken: (method === 'google' ? await beginNativeGoogleSignIn() : await beginAppleSignIn()).accessToken }
      setPreview(await previewSignIn(method, credentials))
    } catch (signInError) {
      setError(signInMessage(signInError))
    } finally {
      setBusy(null)
    }
  }

  const apply = async (choice: AdoptionChoice) => {
    if (!preview) return
    setError('')
    setBusy('applying')
    try {
      await completeSignIn(preview, choice)
      navigate('/')
    } catch (applyError) {
      setError(signInMessage(applyError))
      setBusy(null)
    }
  }

  // Second half: authenticated, nothing written yet, and the person decides.
  if (preview) {
    const hasDeviceDay = Boolean(preview.onDevice && (
      preview.onDevice.items + preview.onDevice.habits + preview.onDevice.meals + preview.onDevice.workouts > 0
    ))
    // Signing in to the account this device already holds is not two days meeting
    // — it is the same day, and the only difference is what has been done here
    // since. Calling that "keep both" would describe a merge that is not
    // happening, and hide what discarding would actually cost.
    const sameAccount = preview.deviceDay?.userId === preview.session.user.id

    return (
      <div className="mx-auto w-full max-w-md space-y-5 py-6">
        <header className="text-center">
          <h1 className="text-2xl font-bold text-ink">
            {!hasDeviceDay
              ? 'Signing in'
              : sameAccount
                ? 'You have already been using this account here'
                : 'What happens to the day on this iPhone?'}
          </h1>
          {sameAccount && hasDeviceDay && (
            <p className="mt-2 text-sm text-ink-muted">
              Anything you did on this iPhone since you last signed in is not on the
              server yet, because nothing uploads. Keeping it is almost always what
              you want.
            </p>
          )}
        </header>

        <div className="card space-y-2">
          <p className="text-sm font-medium text-ink-soft">On this iPhone</p>
          <p className="text-sm text-ink-muted">
            {preview.onDevice ? countLine(preview.onDevice) : 'Nothing yet'}
          </p>
        </div>
        <div className="card space-y-2">
          <p className="text-sm font-medium text-ink-soft">In {preview.session.user.email}</p>
          <p className="text-sm text-ink-muted">{countLine(preview.fromAccount)}</p>
        </div>

        {isGuest && (
          <p className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">
            {/*
              ADR-0012: credits are keyed to a row, and this row is being walked
              away from. Said before the choice, not after it.
            */}
            Signing in leaves your guest session behind. Any AI credits on it are
            lost, and it cannot be reopened.
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">{error}</p>
        )}

        {hasDeviceDay ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void apply('keep_both')}
              disabled={busy !== null}
              className="btn-primary w-full px-3 py-3.5"
            >
              {busy === 'applying'
                ? <LoadingSpinner size="sm" />
                : sameAccount ? 'Keep what I did on this iPhone' : 'Keep both'}
            </button>
            <p className="text-center text-xs text-ink-muted">
              {sameAccount
                ? 'Where the same Item exists in both, the more recent one wins — so completing something here is not undone.'
                : 'Nothing is lost. If you kept the same habit in both places you will have two of it, and can delete one.'}
            </p>
            <button
              type="button"
              onClick={() => void apply('discard_device')}
              disabled={busy !== null}
              className="btn-secondary w-full px-3 py-3.5"
            >
              {sameAccount ? 'Replace it with the server\u2019s copy' : 'Discard the day on this iPhone'}
            </button>
            <p className="text-center text-xs text-ink-muted">
              {sameAccount
                ? 'Permanent. Anything done on this iPhone since you last signed in is lost.'
                : 'Permanent. Only your account\u2019s day remains.'}
            </p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void apply('discard_device')}
            disabled={busy !== null}
            className="btn-primary flex w-full items-center justify-center gap-2 px-3 py-3.5"
          >
            {busy === 'applying' ? <LoadingSpinner size="sm" /> : <ArrowRight className="h-5 w-5" />}
            <span>Continue</span>
          </button>
        )}
      </div>
    )
  }

  // First half: nothing has been read or written yet.
  return (
    <div className="mx-auto w-full max-w-md space-y-5 py-6">
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink">Sign in</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Your account&rsquo;s day comes down to this iPhone. Nothing changes until
          you have seen what is on both sides.
        </p>
      </header>

      <div className={isNativeIOS ? 'grid grid-cols-2 gap-3' : ''}>
        <button
          type="button"
          onClick={() => void authenticate('google')}
          disabled={busy !== null}
          className="btn-secondary flex w-full items-center justify-center gap-2 px-3 py-3.5"
        >
          {busy === 'google' ? <LoadingSpinner size="sm" /> : null}
          <span className={isNativeIOS ? 'text-xs' : ''}>Continue with Google</span>
        </button>
        {isNativeIOS && (
          <button
            type="button"
            onClick={() => void authenticate('apple')}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-control border border-ink bg-ink px-3 py-3.5 text-xs font-semibold text-page disabled:opacity-50"
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

      <form className="space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void authenticate('password') }}>
        <div>
          <label htmlFor="signin-email" className="mb-2 block text-sm font-medium text-ink-soft">Email address</label>
          <input id="signin-email" type="email" className="input-field" value={email} autoComplete="email" onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div>
          <label htmlFor="signin-password" className="mb-2 block text-sm font-medium text-ink-soft">Password</label>
          <input id="signin-password" type="password" className="input-field" value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required />
        </div>

        {error && (
          <p role="alert" className="rounded-control bg-state-danger/10 px-3 py-2 text-sm text-state-danger">{error}</p>
        )}

        <button type="submit" disabled={busy !== null} className="btn-primary flex w-full items-center justify-center gap-2 px-3 py-3.5">
          {busy === 'password' ? <LoadingSpinner size="sm" /> : <ArrowRight className="h-5 w-5" />}
          <span>Sign in</span>
        </button>
      </form>
    </div>
  )
}
