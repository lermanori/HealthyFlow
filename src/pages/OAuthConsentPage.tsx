import { useEffect, useState } from 'react'
import { Check, Loader2, ShieldCheck, X } from 'lucide-react'
import AppMark from '../components/AppMark'
import {
  connectionsService,
  type ApiTokenScope,
  type McpOAuthConsentRequest,
} from '../services/api'

const scopeCopy: Record<ApiTokenScope, string> = {
  'hf:read': 'Read your HealthyFlow Tasks, Habit instances, and health logs',
  'hf:write:add': 'Add new Tasks, Habit instances, and health logs',
  'hf:write:update': 'Update existing HealthyFlow data',
  'hf:write:complete': 'Complete Tasks and Habit instances',
  'hf:write:delete': 'Delete HealthyFlow data when you explicitly ask',
}

export default function OAuthConsentPage() {
  const request = new URLSearchParams(window.location.search).get('request') ?? ''
  const [details, setDetails] = useState<McpOAuthConsentRequest | null>(null)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState<'approve' | 'deny' | null>(null)

  useEffect(() => {
    let active = true
    connectionsService
      .getOAuthRequest(request)
      .then((next) => {
        if (active) setDetails(next)
      })
      .catch(() => {
        if (active) setError('This connection request is invalid or has expired.')
      })
    return () => {
      active = false
    }
  }, [request])

  const complete = async (nextDecision: 'approve' | 'deny') => {
    setDecision(nextDecision)
    setError('')
    try {
      const result = await connectionsService.completeOAuthRequest({
        request,
        decision: nextDecision,
      })
      window.location.assign(result.redirectUrl)
    } catch {
      setDecision(null)
      setError('HealthyFlow could not complete this connection request. Please try again.')
    }
  }

  return (
    <main className="native-consent-page flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <section className="card w-full max-w-lg" aria-labelledby="oauth-consent-title">
        <header className="text-center">
          <AppMark size={56} className="mx-auto mb-4 block" />
          <p className="text-sm font-medium text-accent">Connect to HealthyFlow</p>
          <h1 id="oauth-consent-title" className="mt-1 text-2xl font-bold text-ink">
            Authorize {details?.clientName ?? 'this app'}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Review what this connection can do with your HealthyFlow account.
          </p>
        </header>

        {error && (
          <div className="mt-6 rounded-control border border-state-danger/30 bg-state-danger/10 px-4 py-3 text-sm text-state-danger" role="alert">
            {error}
          </div>
        )}

        {!details && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking connection request
          </div>
        )}

        {details && (
          <>
            <div className="mt-6 rounded-control border border-line bg-sunken/30 p-4">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
                <h2 className="font-semibold text-ink">Permissions requested</h2>
              </div>
              <ul className="space-y-3">
                {details.scopes.map((scope) => (
                  <li key={scope} className="flex gap-3 text-sm text-ink-soft">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-state-success" aria-hidden="true" />
                    <span>{scopeCopy[scope]}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              You can revoke this connection at any time in Settings. HealthyFlow
              only performs state-changing actions through its explicit tools.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                className="btn-secondary inline-flex items-center justify-center gap-2 px-4 py-3"
                disabled={decision !== null}
                onClick={() => void complete('deny')}
              >
                {decision === 'deny' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-3"
                disabled={decision !== null}
                onClick={() => void complete('approve')}
              >
                {decision === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Authorize
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
