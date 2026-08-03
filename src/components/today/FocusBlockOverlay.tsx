import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { Brain, Minimize2 } from 'lucide-react'
import type { DayFocusBlock, FocusBlockTransitionInput } from '../../services/api'
import { useModalFocus } from '../../hooks/useModalFocus'
import { minutesBetween, useElapsedLabel } from '../work/Elapsed'

/**
 * The running Focus block, full screen.
 *
 * While a block is active the day is a distraction, so Today gets out of the way
 * and only the target and the clock remain. Minimizing (or Esc) closes the
 * overlay without ending the block — the block keeps running on the server, and
 * the row's timer pill brings it back.
 */
export default function FocusBlockOverlay({ block, isBusy, onMinimize, onTransition }: {
  block: DayFocusBlock
  isBusy: boolean
  onMinimize: () => void
  onTransition: (action: FocusBlockTransitionInput['action']) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useModalFocus({ open: true, onClose: onMinimize, containerRef: panelRef, pending: isBusy })

  const elapsed = useElapsedLabel(block.startedAt ?? new Date().toISOString())
  const elapsedMinutes = minutesBetween(block.startedAt, null)
  const percent = Math.min(100, Math.round((elapsedMinutes / block.plannedMinutes) * 100))
  const title = block.project?.target ?? block.standaloneTitle ?? block.intendedOutcome

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Focus block in progress"
      data-testid="focus-block-overlay"
      className="fixed inset-0 z-[65] flex flex-col bg-page"
    >
      <div className="flex items-center justify-between p-4">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent">
          <Brain className="h-3.5 w-3.5" />
          Focus{block.project ? ` · ${block.project.name}` : ''}
        </span>
        <button
          type="button"
          onClick={onMinimize}
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm text-ink-muted hover:text-ink"
        >
          <Minimize2 className="h-4 w-4" />Back to Today
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 text-center">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">Current target</p>
          <h1 className="mt-3 text-3xl font-semibold text-ink sm:text-5xl">{title}</h1>
          <p className="mt-4 text-sm text-ink-muted sm:text-base">{block.intendedEvidence}</p>
        </div>

        <div>
          <p className="font-mono text-6xl font-semibold tabular-nums text-accent sm:text-8xl" aria-label="Elapsed time">
            {elapsed}
          </p>
          <p className="mt-3 text-sm text-ink-muted">of {block.plannedMinutes} planned minutes</p>
          <div className="mx-auto mt-4 h-1 w-56 overflow-hidden rounded-full bg-accent/20">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {block.tasks.length > 0 && (
          <div className="w-full max-w-md space-y-1.5 text-left">
            {block.tasks.map(task => (
              <div key={task.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-line-strong px-3 py-2 text-sm text-ink-soft">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent/60" />
                <span className="truncate">{task.title}</span>
                {task.relation && (
                  <span className="ml-auto shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-[10px] text-ink-muted">
                    {task.relation}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 p-6">
        <button type="button" disabled={isBusy} onClick={() => onTransition('finish')} className="btn-primary min-h-11 px-6 py-0 text-sm">Finish</button>
        <button type="button" disabled={isBusy} onClick={() => onTransition('drift')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Report drift</button>
        <button type="button" disabled={isBusy} onClick={() => onTransition('blocked')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Report blocked</button>
        <button type="button" disabled={isBusy} onClick={() => onTransition('cancel')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Cancel block</button>
      </div>
    </div>,
    document.body
  )
}
