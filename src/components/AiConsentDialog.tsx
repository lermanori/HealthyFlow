import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useModalFocus } from '../hooks/useModalFocus'
import type { AiConsentStatus } from '../services/api'

type AiConsentDialogProps = {
  disclosure: AiConsentStatus['disclosure']
  error: string | null
  pending: boolean
  onAllow: () => Promise<void>
  onDecline: () => Promise<void>
}

export default function AiConsentDialog({
  disclosure,
  error,
  pending,
  onAllow,
  onDecline,
}: AiConsentDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const allowRef = useRef<HTMLButtonElement>(null)
  useModalFocus({
    open: true,
    onClose: () => { if (!pending) void onDecline() },
    containerRef: panelRef,
    initialFocusRef: allowRef,
    pending,
  })

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
      aria-describedby="ai-consent-description"
    >
      <button
        type="button"
        aria-label="Continue without AI"
        disabled={pending}
        onClick={() => void onDecline()}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm disabled:cursor-wait"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line-strong bg-page p-5 shadow-2xl outline-none sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-accent/10 text-accent">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id="ai-consent-title" className="text-xl font-semibold text-ink">{disclosure.title}</h2>
            <p id="ai-consent-description" className="mt-2 text-sm leading-6 text-ink-soft">
              {disclosure.introduction}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4 text-sm leading-6 text-ink-soft">
          <div>
            <p className="font-medium text-ink">When you use AI features, HealthyFlow may send:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {disclosure.dataCategories.map((category) => <li key={category}>{category}</li>)}
            </ul>
          </div>
          <p>{disclosure.processing} {disclosure.storage}</p>
          <p className="rounded-lg border border-line bg-sunken/40 p-3 text-ink">
            {disclosure.optionalUse}
          </p>
          <p className="text-xs leading-5 text-ink-muted">{disclosure.futureProviders}</p>
          <p className="text-xs text-ink-muted">
            Read the <Link to="/privacy" className="font-medium text-accent underline underline-offset-2">Privacy Policy</Link>
            {' '}and <Link to="/terms" className="font-medium text-accent underline underline-offset-2">Terms</Link>.
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-state-danger/30 bg-state-danger/10 p-3 text-sm text-state-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => void onDecline()}
            className="btn-secondary min-h-12 px-4 py-3 disabled:cursor-wait disabled:opacity-55"
          >
            Continue without AI
          </button>
          <button
            ref={allowRef}
            type="button"
            disabled={pending}
            onClick={() => void onAllow()}
            className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 px-4 py-3 disabled:cursor-wait disabled:opacity-55"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {pending ? 'Saving permission…' : 'Allow AI features'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
