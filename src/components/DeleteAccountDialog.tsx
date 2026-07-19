import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Download, Loader2, X } from 'lucide-react'
import { accountService } from '../services/api'
import { useModalFocus } from '../hooks/useModalFocus'
import axios from 'axios'

interface DeleteAccountDialogProps {
  onClose: () => void
  onDeleted: (warnings: string[]) => void
  onExport: () => Promise<void>
}

export default function DeleteAccountDialog({ onClose, onDeleted, onExport }: DeleteAccountDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const close = () => { if (!pending) onClose() }
  useModalFocus({ open: true, onClose: close, containerRef: panelRef, initialFocusRef: passwordRef, pending })

  const exportFirst = async () => {
    setExporting(true)
    setError('')
    try { await onExport() } catch { setError('Export failed. Your account has not been changed.') } finally { setExporting(false) }
  }

  const removeAccount = async () => {
    setPending(true)
    setError('')
    try {
      const result = await accountService.deleteAccount({ password, confirmation })
      onDeleted(result.warnings)
    } catch (requestError: unknown) {
      const message = axios.isAxiosError<{ error?: string }>(requestError)
        ? requestError.response?.data?.error
        : undefined
      setError(message ?? 'Could not delete account. Nothing was removed.')
      setPending(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" aria-describedby="delete-account-description">
      <button type="button" aria-label="Close delete account dialog" disabled={pending} onClick={close} className="absolute inset-0 bg-black/65 backdrop-blur-sm disabled:cursor-wait" />
      <div ref={panelRef} tabIndex={-1} className="relative z-10 max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-red-500/30 bg-page p-6 shadow-2xl outline-none">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-red-400" />
            <div>
              <h2 id="delete-account-title" className="text-xl font-semibold text-ink">Delete account permanently</h2>
              <p id="delete-account-description" className="mt-2 text-sm text-ink-muted">This immediately removes your profile, Items, Projects, planning history, health records, workouts, calendar data, assistant history, credits, and API tokens. It cannot be undone.</p>
            </div>
          </div>
          <button type="button" aria-label="Close" disabled={pending} onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"><X className="h-5 w-5" /></button>
        </div>

        <button type="button" disabled={pending || exporting} onClick={() => void exportFirst()} className="btn-secondary mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 disabled:opacity-50">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export my data first
        </button>

        <div className="mt-5 space-y-4 border-t border-line pt-5">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink-soft">Current password</span>
            <input ref={passwordRef} type="password" autoComplete="current-password" className="input-field" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-ink-soft">Type DELETE to confirm</span>
            <input className="input-field font-mono" autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} />
          </label>
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p>}
          <button type="button" disabled={pending || password.length === 0 || confirmation !== 'DELETE'} onClick={() => void removeAccount()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-45">
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? 'Deleting account…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
