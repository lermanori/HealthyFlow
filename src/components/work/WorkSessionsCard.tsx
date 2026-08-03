import { useState } from 'react'
import type { TaskRecord, WorkSession } from '../../services/api'
import { ATTENTION_CLASS, formatSessionTime } from './workPresentation'

interface WorkSessionsCardProps {
  sessions: WorkSession[]
  tasks: TaskRecord[]
  isBusy: boolean
  onRecordSession: () => void
  onRemoveSession: (sessionId: string) => void
}

export default function WorkSessionsCard({ sessions, tasks, isBusy, onRecordSession, onRemoveSession }: WorkSessionsCardProps) {
  const [openReviewIds, setOpenReviewIds] = useState<string[]>([])
  const taskTitle = (id: string) => tasks.find(task => task.id === id)?.title ?? id
  return (
    <section aria-label="Work sessions" className="surface-section p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5"><div><h2 className="text-[17px] font-semibold text-ink">Work sessions</h2><p className="mt-1 text-xs text-ink-muted">Actual Work, separate from the plan.</p></div><button type="button" onClick={onRecordSession} className="btn-secondary min-h-10 px-3.5 py-0 text-xs">Add historical session</button></div>
      {sessions.length === 0 && <p className="py-5 text-sm text-ink-muted">No Work sessions recorded in this scope.</p>}
      {sessions.map(session => {
        const open = openReviewIds.includes(session.id)
        return <article key={session.id} className="border-b border-line py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-xs text-ink-soft">{formatSessionTime(session.occurredAt)} · {session.actualMinutes} actual{session.plannedMinutes ? ` / ${session.plannedMinutes} planned` : ''} min</span><span className={`text-xs font-semibold ${ATTENTION_CLASS[session.attention]}`}>{session.attention}</span></div>
          <p className="mt-2 text-[15px] text-ink">{session.outcome}</p>
          {session.evidence && <p className="mt-1 text-sm text-ink-soft">Evidence · {session.evidence}</p>}
          {session.taskIds.length > 0 && <p className="mt-1 text-xs text-ink-muted">Tasks · {session.taskIds.map(taskTitle).join(', ')}</p>}
          {session.blockerInfo && <p className="mt-1 text-sm text-state-warning">Blocker · {session.blockerInfo}</p>}
          {session.driftInfo && <p className="mt-1 text-sm text-state-warning">Drift · {session.driftInfo}</p>}
          {session.nextStep && <p className="mt-1 text-sm text-ink-soft">Next step · {session.nextStep}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {session.review && <button type="button" onClick={() => setOpenReviewIds(ids => open ? ids.filter(id => id !== session.id) : [...ids, session.id])} className="btn-secondary min-h-10 px-3 py-0 text-xs">{open ? 'Hide structured review' : 'View structured review'}</button>}
            {!session.focusBlockId && <button type="button" disabled={isBusy} onClick={() => { if (window.confirm('Delete this manually entered historical Work session?')) onRemoveSession(session.id) }} className="min-h-10 rounded-[var(--radius-control)] border border-state-danger/30 px-3 text-xs font-semibold text-state-danger">Delete</button>}
          </div>
          {session.review && open && <div className="mt-3 grid gap-2 rounded-xl border border-line bg-sunken p-4 text-sm text-ink-soft"><p><strong className="text-ink">What changed:</strong> {session.review.whatChanged}</p><p><strong className="text-ink">Evidence:</strong> {session.review.evidenceProduced || 'None recorded'}</p><p><strong className="text-ink">Milestone impact:</strong> {session.review.milestoneImpact}</p><p><strong className="text-ink">What got in the way:</strong> {session.review.whatGotInWay || 'Nothing recorded'}</p><p><strong className="text-ink">Unnecessary work:</strong> {session.review.unnecessaryWork || 'None recorded'}</p><p><strong className="text-ink">Confirmed updates:</strong> {session.review.confirmedUpdates.tasks.length} Task update(s), {Object.keys(session.review.confirmedUpdates.project).length} Project update(s)</p></div>}
        </article>
      })}
    </section>
  )
}
