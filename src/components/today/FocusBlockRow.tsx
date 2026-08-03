import { useState } from 'react'
import { Brain, MoreVertical, Play, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { DayFocusBlock } from '../../services/api'
import { useElapsedLabel } from '../work/Elapsed'

/**
 * A Focus block on the Today timeline.
 *
 * Built to the same density as a Task card: one row, sized by its planned
 * minutes like every other timed row, distinguished by hue and a Focus chip
 * rather than by taking more space. It is never a Task, and Today never owns its
 * record — this renders what Work stores and hands every action back to it.
 */

const STATUS_LABEL: Record<DayFocusBlock['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  reviewing: 'Reviewing',
  completed: 'Completed',
  canceled: 'Canceled',
}

/**
 * Deleting is only offered for a block that never became work. The server
 * enforces the same rule — a completed block is kept as the Work session it
 * produced, and an in-flight one has to be canceled first.
 */
function isDeletable(status: DayFocusBlock['status']) {
  return status === 'planned' || status === 'canceled'
}

function TimerPill({ startedAt, onResume }: { startedAt: string; onResume: () => void }) {
  return (
    <button
      type="button"
      onClick={onResume}
      className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/15 px-2.5 text-xs font-semibold text-accent"
    >
      <span className="font-mono tabular-nums" aria-label="Elapsed time">{useElapsedLabel(startedAt)}</span>
      <span className="hidden sm:inline">Resume</span>
    </button>
  )
}

export default function FocusBlockRow({ block, isToday, isBusy, onStart, onResume, onReview, onDelete }: {
  block: DayFocusBlock
  /** Start is offered only on the day the block belongs to. */
  isToday: boolean
  isBusy: boolean
  onStart: () => void
  onResume: () => void
  onReview: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const title = block.project?.target ?? block.standaloneTitle ?? block.intendedOutcome
  const settled = block.status === 'completed' || block.status === 'canceled'

  return (
    <div
      data-testid="timeline-focus-block"
      data-record-kind="focus-block"
      data-focus-block-id={block.id}
      data-focus-block-status={block.status}
      // No overflow-hidden: the kebab menu is absolutely positioned and would be
      // clipped by it, however high its z-index.
      className={`group relative flex h-full min-w-0 items-center gap-2 rounded-lg border p-2.5 transition-all ${
        settled ? 'border-line-strong/50 bg-card/50 opacity-75' : 'border-accent/40 bg-accent/10'
      }`}
    >
      {/* The block points at the work; it does not own it. */}
      <Link
        to={block.projectId ? `/work?projectId=${block.projectId}` : '/work'}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border ${
          settled ? 'border-line-strong bg-card text-ink-muted' : 'border-accent/30 bg-accent/20 text-accent'
        }`}>
          <Brain className="h-3.5 w-3.5" />
        </span>

        <span className="min-w-0 flex-1 space-y-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className={`truncate text-sm font-medium sm:text-base ${settled ? 'text-ink-muted line-through' : 'text-ink'}`}>
              {title}
            </span>
            <span className="hidden shrink-0 rounded-full border border-accent/30 bg-accent/20 px-2 py-0.5 text-[11px] text-accent sm:inline-flex">
              Focus
            </span>
          </span>
          {/* One line, never wrapping — a third line would overflow the row. */}
          <span className="flex min-w-0 items-center gap-x-2 overflow-hidden text-xs text-ink-muted">
            <span className="shrink-0 tabular-nums">{block.startTime} · {block.plannedMinutes}min</span>
            {block.project && <span className="truncate">{block.project.name}</span>}
            {block.tasks.length > 0 && (
              <span className="shrink-0">{block.tasks.length} {block.tasks.length === 1 ? 'Task' : 'Tasks'}</span>
            )}
            {settled && <span className="shrink-0">{STATUS_LABEL[block.status]}</span>}
          </span>
        </span>
      </Link>

      {block.status === 'planned' && isToday && (
        <button
          type="button"
          onClick={onStart}
          disabled={isBusy}
          aria-label="Start focus block"
          className="btn-primary inline-flex min-h-8 shrink-0 items-center gap-1.5 px-2.5 py-0 text-xs"
        >
          <Play className="h-3 w-3 fill-current" />Start
        </button>
      )}

      {block.status === 'active' && block.startedAt && (
        <TimerPill startedAt={block.startedAt} onResume={onResume} />
      )}

      {block.status === 'reviewing' && (
        <button
          type="button"
          onClick={onReview}
          disabled={isBusy}
          className="btn-secondary inline-flex min-h-8 shrink-0 items-center px-2.5 py-0 text-xs"
        >
          Review
        </button>
      )}

      {isDeletable(block.status) && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            aria-label={`More options for ${title}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-raised"
          >
            <MoreVertical className="h-4 w-4 text-ink-muted" />
          </button>

          {showMenu && (
            <div className="task-menu right-0 top-8 min-w-32 rounded-lg shadow-xl">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onDelete()
                  setShowMenu(false)
                }}
                disabled={isBusy}
                className="flex w-full cursor-pointer items-center space-x-2 rounded-lg px-3 py-2 text-sm text-state-danger hover:bg-raised"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
