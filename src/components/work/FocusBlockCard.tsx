import { useMemo } from 'react'
import { Play, Trash2 } from 'lucide-react'
import type {
  CompleteWorkReviewInput,
  FocusBlock,
  FocusBlockTransitionInput,
  TaskRecord,
  WorkProject,
} from '../../services/api'
import { Elapsed } from './Elapsed'
import WorkReviewForm from './WorkReviewForm'

interface FocusBlockCardProps {
  project: WorkProject | null
  tasks: TaskRecord[]
  blocks: FocusBlock[]
  isBusy: boolean
  onPlan: () => void
  onTransition: (focusBlockId: string, action: FocusBlockTransitionInput['action']) => void
  onReview: (focusBlockId: string, input: CompleteWorkReviewInput) => void
  onDelete: (focusBlockId: string) => void
}

/**
 * Deleting is only offered for a block that never became work. The server
 * enforces the same rule: a completed block is kept as the Work session it
 * produced, and an in-flight one has to be canceled first.
 */
function isDeletable(status: FocusBlock['status']) {
  return status === 'planned' || status === 'canceled'
}

export default function FocusBlockCard({ project, tasks, blocks, isBusy, onPlan, onTransition, onReview, onDelete }: FocusBlockCardProps) {
  const sorted = useMemo(() => [...blocks].sort((a, b) => `${b.scheduledDate}T${b.startTime}`.localeCompare(`${a.scheduledDate}T${a.startTime}`)), [blocks])
  return (
    <section aria-label="Focus blocks" className="surface-section p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[17px] font-semibold text-ink">Focus blocks</h2><p className="mt-1 text-[13px] text-ink-muted">Planned and actual focused work persist independently of Talk.</p></div><button type="button" onClick={onPlan} className="btn-primary min-h-11 px-4 py-0 text-sm">Schedule Focus block</button></div>
      {sorted.length === 0 && <p className="mt-5 text-sm text-ink-muted">No Focus blocks in this scope yet.</p>}
      <div className="mt-4 flex flex-col gap-4">
        {sorted.map(block => {
          const referenced = tasks.filter(task => block.taskIds.includes(task.id))
          return (
            <article key={block.id} className={`rounded-xl border p-4 ${block.status === 'active' ? 'border-accent/50 bg-accent/[0.08]' : 'border-line bg-page'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">{block.scheduledDate} · {block.startTime} · {block.plannedMinutes} min</p><h3 className="mt-2 text-lg font-semibold text-ink">{project?.target || block.standaloneTitle || block.intendedOutcome}</h3></div><div className="flex items-center gap-2"><span className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold capitalize text-ink-soft">{block.status}</span>{isDeletable(block.status) && <button type="button" disabled={isBusy} onClick={() => onDelete(block.id)} aria-label={`Delete Focus block ${block.intendedOutcome}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted hover:bg-raised hover:text-state-danger"><Trash2 className="h-4 w-4" /></button>}</div></div>
              <p className="mt-3 text-sm text-ink"><span className="font-semibold">Intended outcome:</span> {block.intendedOutcome}</p>
              <p className="mt-1 text-sm text-ink-soft"><span className="font-semibold">Intended evidence:</span> {block.intendedEvidence}</p>
              <p className="mt-2 text-xs text-ink-muted">Referenced Tasks · {referenced.length ? referenced.map(task => task.title).join(', ') : 'None (standalone)'}</p>
              {block.status === 'active' && block.startedAt && <div className="mt-4 rounded-xl border border-accent/30 bg-card p-4"><p className="text-xs uppercase tracking-[0.12em] text-ink-muted">Elapsed from persisted start</p><p className="mt-1 font-mono text-3xl font-semibold text-accent"><Elapsed startedAt={block.startedAt} /></p><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={isBusy} onClick={() => onTransition(block.id, 'finish')} className="btn-primary min-h-11 px-4 py-0 text-sm">Finish</button><button type="button" disabled={isBusy} onClick={() => onTransition(block.id, 'blocked')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Report blocked</button><button type="button" disabled={isBusy} onClick={() => onTransition(block.id, 'drift')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Report drift</button><button type="button" disabled={isBusy} onClick={() => onTransition(block.id, 'cancel')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Cancel</button></div></div>}
              {block.status === 'planned' && <button type="button" disabled={isBusy} onClick={() => onTransition(block.id, 'start')} className="btn-primary mt-4 inline-flex min-h-11 items-center gap-2 px-4 py-0 text-sm"><Play className="h-4 w-4 fill-current" />Start manually</button>}
              {block.status === 'reviewing' && <WorkReviewForm block={block} tasks={tasks} project={project} isBusy={isBusy} onReview={input => onReview(block.id, input)} onTransition={action => onTransition(block.id, action)} />}
            </article>
          )
        })}
      </div>
    </section>
  )
}
