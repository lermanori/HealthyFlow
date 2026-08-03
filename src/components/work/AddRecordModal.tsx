import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  TARGET_RELATIONS,
  type Attention,
  type CreateFocusBlockInput,
  type CreateTaskRecordInput,
  type CreateWorkProjectInput,
  type RecordWorkSessionInput,
  type TargetRelation,
  type TaskRecord,
  type WorkProject,
} from '../../services/api'
import { useModalFocus } from '../../hooks/useModalFocus'
import { RequiredFieldMark, RequiredFieldsNote } from './RequiredFieldMark'

export type RecordTab = 'task' | 'project' | 'focus' | 'session'

interface AddRecordModalProps {
  open: boolean
  initialTab: RecordTab
  project: WorkProject | null
  tasks: TaskRecord[]
  prefillTaskId?: string | null
  isBusy: boolean
  onClose: () => void
  onCreateTask: (input: CreateTaskRecordInput) => void
  onCreateProject: (input: CreateWorkProjectInput) => void
  onCreateFocusBlock: (input: CreateFocusBlockInput) => void
  onRecordSession: (input: RecordWorkSessionInput) => void
}

function defaultFocusSchedule(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` }
}

function emptyFocusDraft(prefillTaskId?: string | null) {
  return {
    title: '',
    context: '',
    ...defaultFocusSchedule(),
    minutes: '45',
    outcome: '',
    evidence: '',
    transition: '',
    breakMinutes: '',
    taskIds: prefillTaskId ? [prefillTaskId] : [] as string[],
  }
}
const ATTENTION: Attention[] = ['Focused', 'Mixed', 'Drifted']
const TABS: Array<{ id: RecordTab; label: string }> = [
  { id: 'task', label: 'Task' }, { id: 'project', label: 'Project' },
  { id: 'focus', label: 'Focus block' }, { id: 'session', label: 'Work session' },
]

export default function AddRecordModal({ open, initialTab, project, tasks, prefillTaskId, isBusy, onClose, onCreateTask, onCreateProject, onCreateFocusBlock, onRecordSession }: AddRecordModalProps) {
  const [tab, setTab] = useState<RecordTab>(initialTab)
  const [error, setError] = useState('')
  const [task, setTask] = useState({ title: '', relation: 'Direct progress' as TargetRelation })
  const [newProject, setNewProject] = useState({ name: '', target: '', definitionOfDone: '', milestone: '', deadline: '', summary: '' })
  const [focus, setFocus] = useState(() => emptyFocusDraft())
  const [session, setSession] = useState({ title: '', context: '', actualMinutes: '30', outcome: '', evidence: '', attention: 'Focused' as Attention, blocker: '', drift: '', nextStep: '', occurredAt: '' })
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const projectId = project?.id ?? null
  useModalFocus({ open, onClose, containerRef: dialogRef, initialFocusRef: closeRef, pending: isBusy })

  useEffect(() => {
    if (!open) return
    setTab(!projectId && initialTab === 'task' ? 'project' : initialTab)
    setError('')
    setTask({ title: '', relation: 'Direct progress' })
    setNewProject({ name: '', target: '', definitionOfDone: '', milestone: '', deadline: '', summary: '' })
    setFocus(emptyFocusDraft(prefillTaskId))
    setSession({ title: '', context: '', actualMinutes: '30', outcome: '', evidence: '', attention: 'Focused', blocker: '', drift: '', nextStep: '', occurredAt: '' })
  }, [open, initialTab, projectId, prefillTaskId])

  if (!open) return null
  const numberOrNull = (value: string) => value.trim() ? Number(value) : null
  const toggleTask = (id: string) => setFocus(value => ({ ...value, taskIds: value.taskIds.includes(id) ? value.taskIds.filter(taskId => taskId !== id) : [...value.taskIds, id] }))

  const submit = () => {
    setError('')
    if (tab === 'task') {
      if (!project) return setError('Select a Project first.')
      if (!task.title.trim()) return setError('Give the Task a title.')
      return onCreateTask({ title: task.title.trim(), relation: task.relation })
    }
    if (tab === 'project') {
      if (!newProject.name.trim()) return setError('Give the Project a name.')
      return onCreateProject({ name: newProject.name.trim(), target: newProject.target.trim() || null, milestone: newProject.milestone.trim() || null, definitionOfDone: newProject.definitionOfDone.trim() || null, deadline: newProject.deadline || null, context: newProject.summary.trim() ? { summary: newProject.summary.trim() } : undefined })
    }
    if (tab === 'focus') {
      const minutes = Number(focus.minutes)
      if (!focus.date || !focus.time || !Number.isInteger(minutes) || minutes <= 0) return setError('Enter a valid date, start time, and planned focused minutes.')
      if (!focus.outcome.trim() || !focus.evidence.trim()) return setError('Record both the intended outcome and evidence.')
      if (project && focus.taskIds.length === 0) return setError('Choose at least one referenced Task for this Project block.')
      if (!project && !focus.title.trim()) return setError('Give standalone Work a title.')
      return onCreateFocusBlock({ projectId: project?.id ?? null, taskIds: focus.taskIds, standaloneTitle: project ? null : focus.title.trim(), standaloneContext: project ? null : focus.context.trim() || null, scheduledDate: focus.date, startTime: focus.time, plannedMinutes: minutes, intendedOutcome: focus.outcome.trim(), intendedEvidence: focus.evidence.trim(), transitionMinutes: numberOrNull(focus.transition), breakMinutes: numberOrNull(focus.breakMinutes) })
    }
    const actual = Number(session.actualMinutes)
    if (!Number.isInteger(actual) || actual < 0 || !session.outcome.trim()) return setError('Enter an outcome and valid actual focused minutes.')
    if (!project && !session.title.trim()) return setError('Give standalone Work a title.')
    return onRecordSession({ projectId: project?.id ?? null, taskIds: [], standaloneTitle: project ? null : session.title.trim(), standaloneContext: project ? null : session.context.trim() || null, actualMinutes: actual, outcome: session.outcome.trim(), evidence: session.evidence.trim() || null, attention: session.attention, blockerInfo: session.blocker.trim() || null, driftInfo: session.drift.trim() || null, nextStep: session.nextStep.trim() || null, occurredAt: session.occurredAt ? new Date(session.occurredAt).toISOString() : undefined })
  }

  const field = 'input-field min-h-11 py-0 text-sm'
  const label = 'flex flex-col gap-1.5'
  return createPortal(<div className="fixed inset-0 z-[60] flex items-center justify-center p-4"><button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" /><div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add Work record" className="surface-overlay relative z-[1] max-h-[90vh] w-[680px] max-w-full overflow-auto">
    <div className="flex items-start justify-between gap-3 p-5"><div><h2 className="text-lg font-semibold text-ink">Add manually</h2><p className="mt-1 text-xs text-ink-muted">No Talk or AI required.</p></div><button ref={closeRef} type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-line"><X className="h-4 w-4" /></button></div>
    <div role="tablist" className="mx-5 grid grid-cols-2 gap-1 rounded-xl border border-line p-1 md:grid-cols-4">{TABS.map(entry => <button key={entry.id} type="button" role="tab" aria-selected={tab === entry.id} disabled={entry.id === 'task' && !project} onClick={() => { setTab(entry.id); setError('') }} className={`min-h-10 rounded-lg text-xs font-semibold ${tab === entry.id ? 'bg-accent/15 text-accent' : 'text-ink-soft'} disabled:text-ink-disabled`}>{entry.label}</button>)}</div>
    <div className="grid gap-4 p-5">
      <RequiredFieldsNote />
      {tab === 'task' && <><label className={label}><span className="text-xs text-ink-soft">Title<RequiredFieldMark /></span><input required autoFocus value={task.title} onChange={e => setTask({ ...task, title: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Relationship to target<RequiredFieldMark /></span><select required value={task.relation} onChange={e => setTask({ ...task, relation: e.target.value as TargetRelation })} className={field}>{TARGET_RELATIONS.map(relation => <option key={relation}>{relation}</option>)}</select></label></>}
      {tab === 'project' && <><label className={label}><span className="text-xs text-ink-soft">Name<RequiredFieldMark /></span><input required autoFocus value={newProject.name} onChange={e => setNewProject({ ...newProject, name: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Target</span><input value={newProject.target} onChange={e => setNewProject({ ...newProject, target: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Definition of done</span><input value={newProject.definitionOfDone} onChange={e => setNewProject({ ...newProject, definitionOfDone: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Current milestone</span><input value={newProject.milestone} onChange={e => setNewProject({ ...newProject, milestone: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Summary</span><textarea rows={3} value={newProject.summary} onChange={e => setNewProject({ ...newProject, summary: e.target.value })} className="input-field resize-y" /></label><label className={label}><span className="text-xs text-ink-soft">Deadline</span><input type="date" value={newProject.deadline} onChange={e => setNewProject({ ...newProject, deadline: e.target.value })} className={field} /></label></>}
      {tab === 'focus' && <><div className="grid gap-4 md:grid-cols-3"><label className={label}><span className="text-xs text-ink-soft">Scheduled date<RequiredFieldMark /></span><input required type="date" value={focus.date} onChange={e => setFocus({ ...focus, date: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Start time<RequiredFieldMark /></span><input required type="time" value={focus.time} onChange={e => setFocus({ ...focus, time: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Focused minutes<RequiredFieldMark /></span><input required type="number" min="1" max="1440" value={focus.minutes} onChange={e => setFocus({ ...focus, minutes: e.target.value })} className={field} /></label></div>{!project && <><label className={label}><span className="text-xs text-ink-soft">Standalone title<RequiredFieldMark /></span><input required value={focus.title} onChange={e => setFocus({ ...focus, title: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Standalone context</span><textarea rows={2} value={focus.context} onChange={e => setFocus({ ...focus, context: e.target.value })} className="input-field resize-y" /></label></>}<label className={label}><span className="text-xs text-ink-soft">Intended outcome<RequiredFieldMark /></span><input required value={focus.outcome} onChange={e => setFocus({ ...focus, outcome: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Intended evidence<RequiredFieldMark /></span><input required value={focus.evidence} onChange={e => setFocus({ ...focus, evidence: e.target.value })} className={field} /></label>{project && <fieldset className="rounded-xl border border-line p-3"><legend className="px-1 text-xs font-semibold text-ink">Referenced Tasks<RequiredFieldMark /></legend>{tasks.map(candidate => <label key={candidate.id} className="mt-2 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={focus.taskIds.includes(candidate.id)} onChange={() => toggleTask(candidate.id)} />{candidate.title}</label>)}</fieldset>}<div className="grid gap-4 md:grid-cols-2"><label className={label}><span className="text-xs text-ink-soft">Transition minutes (optional)</span><input type="number" min="0" max="180" value={focus.transition} onChange={e => setFocus({ ...focus, transition: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Break minutes (optional)</span><input type="number" min="0" max="180" value={focus.breakMinutes} onChange={e => setFocus({ ...focus, breakMinutes: e.target.value })} className={field} /></label></div></>}
      {tab === 'session' && <>{!project && <><label className={label}><span className="text-xs text-ink-soft">Standalone title<RequiredFieldMark /></span><input required value={session.title} onChange={e => setSession({ ...session, title: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Standalone context</span><textarea rows={2} value={session.context} onChange={e => setSession({ ...session, context: e.target.value })} className="input-field resize-y" /></label></>}<div className="grid gap-4 md:grid-cols-2"><label className={label}><span className="text-xs text-ink-soft">Actual focused minutes<RequiredFieldMark /></span><input required type="number" min="0" value={session.actualMinutes} onChange={e => setSession({ ...session, actualMinutes: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Occurred at (optional)</span><input type="datetime-local" value={session.occurredAt} onChange={e => setSession({ ...session, occurredAt: e.target.value })} className={field} /></label></div><label className={label}><span className="text-xs text-ink-soft">Outcome<RequiredFieldMark /></span><textarea required rows={2} value={session.outcome} onChange={e => setSession({ ...session, outcome: e.target.value })} className="input-field resize-y" /></label><label className={label}><span className="text-xs text-ink-soft">Evidence</span><input value={session.evidence} onChange={e => setSession({ ...session, evidence: e.target.value })} className={field} /></label><div className="grid gap-4 md:grid-cols-2"><label className={label}><span className="text-xs text-ink-soft">Attention<RequiredFieldMark /></span><select required value={session.attention} onChange={e => setSession({ ...session, attention: e.target.value as Attention })} className={field}>{ATTENTION.map(value => <option key={value}>{value}</option>)}</select></label><label className={label}><span className="text-xs text-ink-soft">Next step</span><input value={session.nextStep} onChange={e => setSession({ ...session, nextStep: e.target.value })} className={field} /></label></div><label className={label}><span className="text-xs text-ink-soft">Blocker information</span><input value={session.blocker} onChange={e => setSession({ ...session, blocker: e.target.value })} className={field} /></label><label className={label}><span className="text-xs text-ink-soft">Drift information</span><input value={session.drift} onChange={e => setSession({ ...session, drift: e.target.value })} className={field} /></label></>}
      {error && <p role="alert" className="text-sm text-state-danger">{error}</p>}
    </div>
    <div className="flex justify-end gap-2 border-t border-line p-4"><button type="button" onClick={onClose} className="btn-secondary min-h-11 px-4 py-0 text-sm">Cancel</button><button type="button" disabled={isBusy} onClick={submit} className="btn-primary min-h-11 px-4 py-0 text-sm">Save {tab === 'focus' ? 'Focus block' : tab}</button></div>
  </div></div>, document.body)
}
