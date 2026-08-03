import { useState } from 'react'
import type {
  Attention,
  CompleteWorkReviewInput,
  FocusBlock,
  FocusBlockTransitionInput,
  MilestoneImpact,
  TaskReviewAction,
} from '../../services/api'
import { minutesBetween } from './Elapsed'
import { RequiredFieldMark, RequiredFieldsNote } from './RequiredFieldMark'

const ATTENTION: Attention[] = ['Focused', 'Mixed', 'Drifted']
const IMPACT: Array<{ value: MilestoneImpact; label: string }> = [
  { value: 'advanced', label: 'Advanced the milestone' },
  { value: 'unblocked', label: 'Unblocked the milestone' },
  { value: 'both', label: 'Advanced and unblocked it' },
  { value: 'neither', label: 'Neither' },
]

/**
 * The one Work review form, shared by the Work page (inline) and Today (in a
 * sheet). Props are the structural minimum both callers can satisfy so neither
 * surface can grow its own copy of these semantics.
 */
export default function WorkReviewForm({ block, tasks, project, isBusy, onReview, onTransition }: {
  block: FocusBlock
  tasks: Array<{ id: string; title: string }>
  project: { milestone: string | null } | null
  isBusy: boolean
  onReview: (input: CompleteWorkReviewInput) => void
  onTransition: (action: FocusBlockTransitionInput['action']) => void
}) {
  const referenced = tasks.filter(task => block.taskIds.includes(task.id))
  const [whatChanged, setWhatChanged] = useState('')
  const [evidenceProduced, setEvidenceProduced] = useState('')
  const [milestoneImpact, setMilestoneImpact] = useState<MilestoneImpact>('neither')
  const [whatGotInWay, setWhatGotInWay] = useState('')
  const [unnecessaryWork, setUnnecessaryWork] = useState('')
  const [actualMinutes, setActualMinutes] = useState(String(minutesBetween(block.startedAt, block.endedAt)))
  const [nextStep, setNextStep] = useState('')
  const [attention, setAttention] = useState<Attention>(block.reviewTrigger === 'drifted' ? 'Drifted' : 'Focused')
  const [taskActions, setTaskActions] = useState<Record<string, TaskReviewAction | ''>>({})
  const [addBlocker, setAddBlocker] = useState(false)
  const [blocker, setBlocker] = useState('')
  const [updateNextStep, setUpdateNextStep] = useState(false)
  const [updateMilestone, setUpdateMilestone] = useState(false)
  const [milestone, setMilestone] = useState(project?.milestone ?? '')
  const actual = Number(actualMinutes)
  const valid = whatChanged.trim() && nextStep.trim() && Number.isInteger(actual) && actual >= 0 && actual <= 1440

  return (
    <form className="mt-4 rounded-xl border border-state-warning/30 bg-sunken p-4" onSubmit={event => {
      event.preventDefault()
      if (!valid) return
      const projectUpdates: CompleteWorkReviewInput['updates']['project'] = {}
      if (addBlocker && blocker.trim()) projectUpdates.addBlocker = blocker.trim()
      if (updateNextStep) projectUpdates.nextStep = nextStep.trim()
      if (updateMilestone) projectUpdates.milestone = milestone.trim()
      onReview({
        whatChanged: whatChanged.trim(), evidenceProduced: evidenceProduced.trim(), milestoneImpact,
        whatGotInWay: whatGotInWay.trim(), unnecessaryWork: unnecessaryWork.trim(), actualMinutes: actual,
        nextStep: nextStep.trim(), attention,
        updates: {
          tasks: Object.entries(taskActions).filter(([, action]) => action).map(([taskId, action]) => ({ taskId, action: action as TaskReviewAction })),
          project: projectUpdates,
        },
      })
    }}>
      <h3 className="text-base font-semibold text-ink">Complete the Work review</h3>
      <p className="mt-1 text-xs text-ink-muted">The Work session is created only when this review and its explicit updates succeed together.</p>
      <RequiredFieldsNote className="mt-2" />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 md:col-span-2"><span className="text-xs text-ink-soft">What changed?<RequiredFieldMark /></span><textarea required rows={3} value={whatChanged} onChange={e => setWhatChanged(e.target.value)} className="input-field resize-y" /></label>
        <label className="flex flex-col gap-1.5 md:col-span-2"><span className="text-xs text-ink-soft">What evidence was produced?</span><textarea rows={2} value={evidenceProduced} onChange={e => setEvidenceProduced(e.target.value)} className="input-field resize-y" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Did this advance or unblock the milestone?<RequiredFieldMark /></span><select required value={milestoneImpact} onChange={e => setMilestoneImpact(e.target.value as MilestoneImpact)} className="input-field min-h-11 py-0">{IMPACT.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Focused minutes that actually happened<RequiredFieldMark /></span><input required type="number" min="0" max="1440" value={actualMinutes} onChange={e => setActualMinutes(e.target.value)} className="input-field min-h-11 py-0" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">What got in the way?</span><textarea rows={2} value={whatGotInWay} onChange={e => setWhatGotInWay(e.target.value)} className="input-field resize-y" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Did unnecessary work appear?</span><textarea rows={2} value={unnecessaryWork} onChange={e => setUnnecessaryWork(e.target.value)} className="input-field resize-y" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Smallest valuable next step<RequiredFieldMark /></span><input required value={nextStep} onChange={e => setNextStep(e.target.value)} className="input-field min-h-11 py-0" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-xs text-ink-soft">Attention<RequiredFieldMark /></span><select required value={attention} onChange={e => setAttention(e.target.value as Attention)} className="input-field min-h-11 py-0">{ATTENTION.map(value => <option key={value}>{value}</option>)}</select></label>
      </div>

      <fieldset className="mt-5 rounded-xl border border-line p-3">
        <legend className="px-1 text-sm font-semibold text-ink">Explicit post-review updates</legend>
        <p className="mb-3 text-xs text-ink-muted">Every untouched control means “make no change.”</p>
        {referenced.map(task => (
          <label key={task.id} className="mb-2 grid items-center gap-2 md:grid-cols-[1fr_220px]"><span className="text-sm text-ink">{task.title}</span><select aria-label={`Review update for ${task.title}`} value={taskActions[task.id] ?? ''} onChange={e => setTaskActions({ ...taskActions, [task.id]: e.target.value as TaskReviewAction | '' })} className="input-field min-h-10 py-0 text-xs"><option value="">Leave Task unchanged</option><option value="complete">Complete</option><option value="reopen">Reopen</option><option value="defer">Defer</option><option value="reactivate">Reactivate</option></select></label>
        ))}
        {project && <div className="mt-3 grid gap-3">
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={addBlocker} onChange={e => setAddBlocker(e.target.checked)} /> Add a blocker to Project context</label>{addBlocker && <input value={blocker} onChange={e => setBlocker(e.target.value)} placeholder="Blocker" className="input-field min-h-10 py-0" />}
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={updateNextStep} onChange={e => setUpdateNextStep(e.target.checked)} /> Update the next valuable step to the answer above</label>
          <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={updateMilestone} onChange={e => setUpdateMilestone(e.target.checked)} /> Update the milestone</label>{updateMilestone && <input value={milestone} onChange={e => setMilestone(e.target.value)} className="input-field min-h-10 py-0" />}
        </div>}
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={isBusy || !valid} className="btn-primary min-h-11 px-4 py-0 text-sm">Complete review and create Work session</button>
        <button type="button" disabled={isBusy} onClick={() => onTransition('continue')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Continue working</button>
        <button type="button" disabled={isBusy} onClick={() => onTransition('cancel')} className="btn-secondary min-h-11 px-4 py-0 text-sm">Cancel block</button>
      </div>
    </form>
  )
}
