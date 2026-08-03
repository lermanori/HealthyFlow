import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type {
  CompleteWorkReviewInput,
  DayFocusBlock,
  FocusBlockTransitionInput,
} from '../../services/api'
import { useModalFocus } from '../../hooks/useModalFocus'
import WorkReviewForm from './WorkReviewForm'

/**
 * The Work review as a sheet over Today.
 *
 * The Work page renders the same form inline; on Today the day is still behind
 * you, so the review gets its own surface without costing you the timeline.
 * Closing means "continue working", never "discard" — a block in `reviewing` is
 * a real state on the server, and dismissing the sheet must not silently strand
 * it there.
 */
export default function WorkReviewSheet({ block, isBusy, onReview, onTransition }: {
  block: DayFocusBlock
  isBusy: boolean
  onReview: (input: CompleteWorkReviewInput) => void
  onTransition: (action: FocusBlockTransitionInput['action']) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const close = () => { if (!isBusy) onTransition('continue') }
  useModalFocus({ open: true, onClose: close, containerRef: panelRef, pending: isBusy })

  const heading = block.project?.target ?? block.standaloneTitle ?? block.intendedOutcome

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Complete the Work review"
        data-testid="work-review-sheet"
        className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {block.project && (
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{block.project.name}</p>
            )}
            <h2 className="mt-1 truncate text-lg font-semibold text-ink">{heading}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={isBusy}
            aria-label="Continue working"
            className="-m-2 p-2 text-ink-muted hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <WorkReviewForm
          block={block}
          tasks={block.tasks}
          project={block.project}
          isBusy={isBusy}
          onReview={onReview}
          onTransition={onTransition}
        />
      </div>
    </div>,
    document.body
  )
}
